
import os
import re
import json
import sqlite3

from pathlib import Path
from contextlib import closing
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from starlette.middleware.sessions import SessionMiddleware

from pydantic import BaseModel, Field, model_validator
from pwdlib import PasswordHash

from calculations import simulate, parametric_study


# =========================================
# CONFIGURATION DES CHEMINS
# =========================================

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

IS_VERCEL = os.environ.get("VERCEL") == "1"

if IS_VERCEL:
    DATABASE_PATH = Path("/tmp/processsim.db")
else:
    DATABASE_PATH = BASE_DIR / "processsim.db"

DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)


# =========================================
# CONFIGURATION DE L'APPLICATION
# =========================================

SECRET_KEY = os.environ.get(
    "SECRET_KEY",
    "processsim-cle-secrete-temporaire-a-remplacer"
)

app = FastAPI(
    title="ProcessSim",
    description="Application de simulation des procédés",
    version="2.0.0"
)

app.add_middleware(
    SessionMiddleware,
    secret_key=SECRET_KEY,
    session_cookie="processsim_session",
    max_age=60 * 60 * 24 * 7,
    same_site="lax",
    https_only=IS_VERCEL
)

password_hash = PasswordHash.recommended()


# =========================================
# CONNEXION DATABASE
# =========================================

def get_connection():

    conn = sqlite3.connect(
        str(DATABASE_PATH),
        timeout=30
    )

    conn.row_factory = sqlite3.Row

    return conn


# =========================================
# CREATION ET MISE A JOUR DES TABLES
# =========================================

def create_tables():

    with closing(get_connection()) as conn:

        cursor = conn.cursor()

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                email TEXT NOT NULL COLLATE NOCASE UNIQUE,
                password_hash TEXT NOT NULL,
                date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS simulations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date_simulation TIMESTAMP NOT NULL,
                parametres TEXT NOT NULL,
                resultats TEXT NOT NULL
            )
        """)

        cursor.execute("PRAGMA table_info(simulations)")

        columns = [
            row["name"]
            for row in cursor.fetchall()
        ]

        if "user_id" not in columns:

            cursor.execute("""
                ALTER TABLE simulations
                ADD COLUMN user_id INTEGER REFERENCES users(id)
            """)

        conn.commit()


@app.on_event("startup")
def startup_event():

    create_tables()


# =========================================
# MODELES DE SIMULATION
# =========================================

class SimulationInput(BaseModel):

    Cp: float = Field(default=3.8, gt=0)

    lambda_: float = Field(
        default=2300,
        gt=0,
        alias="lambda"
    )

    m0: float = Field(default=1000, gt=0)

    x0: float = Field(
        default=10,
        ge=0,
        le=100
    )

    residus: float = Field(default=20, ge=0)

    mR: float = Field(default=100, ge=0)

    xR: float = Field(
        default=40,
        ge=0,
        le=100
    )

    T2: float = 20
    T3: float = 80

    x4: float = Field(
        default=40,
        gt=0,
        le=100
    )

    T5: float = 25

    @model_validator(mode="after")
    def verifier_parametres(self):

        if self.residus > self.m0:
            raise ValueError(
                "Les résidus ne peuvent pas dépasser le débit initial."
            )

        if self.T3 <= self.T2:
            raise ValueError(
                "La température T3 doit être supérieure à T2."
            )

        if self.T5 > self.T3:
            raise ValueError(
                "La température T5 doit être inférieure ou égale à T3."
            )

        return self

    def to_calculation_dict(self):

        return {
            "Cp": self.Cp,
            "lambda": self.lambda_,
            "m0": self.m0,
            "x0": self.x0,
            "residus": self.residus,
            "mR": self.mR,
            "xR": self.xR,
            "T2": self.T2,
            "T3": self.T3,
            "x4": self.x4,
            "T5": self.T5
        }


# =========================================
# MODELES AUTHENTIFICATION
# =========================================

class SignUpInput(BaseModel):

    username: str = Field(
        min_length=3,
        max_length=50
    )

    email: str = Field(
        min_length=5,
        max_length=150
    )

    password: str = Field(
        min_length=8,
        max_length=128
    )

    confirm_password: str = Field(
        min_length=8,
        max_length=128
    )

    @model_validator(mode="after")
    def verifier_inscription(self):

        self.username = self.username.strip()
        self.email = self.email.strip().lower()

        if not self.username:
            raise ValueError(
                "Le nom d'utilisateur est obligatoire."
            )

        if not re.fullmatch(
            r"[^@\s]+@[^@\s]+\.[^@\s]+",
            self.email
        ):
            raise ValueError(
                "Adresse email invalide."
            )

        if self.password != self.confirm_password:
            raise ValueError(
                "Les mots de passe ne correspondent pas."
            )

        return self


class SignInInput(BaseModel):

    email: str
    password: str


# =========================================
# UTILISATEUR CONNECTE
# =========================================

def get_session_user_id(request: Request):

    return request.session.get("user_id")


# =========================================
# INSCRIPTION - SIGN UP
# =========================================

@app.post("/api/auth/signup")
def signup(data: SignUpInput):

    username = data.username
    email = data.email

    hashed_password = password_hash.hash(data.password)

    try:

        with closing(get_connection()) as conn:

            cursor = conn.cursor()

            cursor.execute("""
                INSERT INTO users (
                    username,
                    email,
                    password_hash
                )
                VALUES (?, ?, ?)
            """, (
                username,
                email,
                hashed_password
            ))

            user_id = cursor.lastrowid

            conn.commit()

        return {
            "success": True,
            "message": "Compte créé avec succès.",
            "user": {
                "id": user_id,
                "username": username,
                "email": email
            }
        }

    except sqlite3.IntegrityError:

        raise HTTPException(
            status_code=400,
            detail="Cette adresse email est déjà utilisée."
        )


# =========================================
# CONNEXION - SIGN IN
# =========================================

@app.post("/api/auth/signin")
def signin(data: SignInInput, request: Request):

    email = data.email.strip().lower()

    with closing(get_connection()) as conn:

        cursor = conn.cursor()

        cursor.execute("""
            SELECT id, username, email, password_hash
            FROM users
            WHERE email = ?
        """, (email,))

        user = cursor.fetchone()

    if user is None:

        raise HTTPException(
            status_code=401,
            detail="Email ou mot de passe incorrect."
        )

    if not password_hash.verify(
        data.password,
        user["password_hash"]
    ):

        raise HTTPException(
            status_code=401,
            detail="Email ou mot de passe incorrect."
        )

    request.session.clear()
    request.session["user_id"] = user["id"]

    return {
        "success": True,
        "message": "Connexion réussie.",
        "user": {
            "id": user["id"],
            "username": user["username"],
            "email": user["email"]
        }
    }


# =========================================
# VERIFICATION DE LA SESSION
# =========================================

@app.get("/api/auth/me")
def get_current_user(request: Request):

    user_id = get_session_user_id(request)

    if not user_id:

        return {
            "authenticated": False,
            "user": None
        }

    with closing(get_connection()) as conn:

        cursor = conn.cursor()

        cursor.execute("""
            SELECT id, username, email
            FROM users
            WHERE id = ?
        """, (user_id,))

        user = cursor.fetchone()

    if user is None:

        request.session.clear()

        return {
            "authenticated": False,
            "user": None
        }

    return {
        "authenticated": True,
        "user": {
            "id": user["id"],
            "username": user["username"],
            "email": user["email"]
        }
    }


# =========================================
# DECONNEXION - LOG OUT
# =========================================

@app.post("/api/auth/logout")
def logout(request: Request):

    request.session.clear()

    return {
        "success": True,
        "message": "Déconnexion réussie."
    }


# =========================================
# PAGE PRINCIPALE
# =========================================

@app.get("/")
def home():

    index_file = STATIC_DIR / "index.html"

    if not index_file.exists():

        raise HTTPException(
            status_code=404,
            detail="Fichier index.html introuvable."
        )

    return FileResponse(index_file)


# =========================================
# VERIFICATION API
# =========================================

@app.get("/api/health")
def health():

    return {
        "success": True,
        "message": "ProcessSim API fonctionne correctement."
    }


# =========================================
# ENREGISTREMENT D'UNE SIMULATION
# =========================================

def enregistrer_simulation(
    parametres,
    resultats,
    user_id=None
):

    date_actuelle = datetime.now(
        timezone.utc
    ).isoformat()

    with closing(get_connection()) as conn:

        cursor = conn.cursor()

        cursor.execute("""
            INSERT INTO simulations (
                date_simulation,
                parametres,
                resultats,
                user_id
            )
            VALUES (?, ?, ?, ?)
        """, (
            date_actuelle,
            json.dumps(
                parametres,
                ensure_ascii=False
            ),
            json.dumps(
                resultats,
                ensure_ascii=False
            ),
            user_id
        ))

        simulation_id = cursor.lastrowid

        conn.commit()

        return simulation_id


# =========================================
# SIMULATION PRINCIPALE
# =========================================

@app.post("/api/simulate")
def run_simulation(
    data: SimulationInput,
    request: Request
):

    try:

        parametres = data.to_calculation_dict()

        resultats = simulate(parametres)

        user_id = get_session_user_id(request)

        simulation_id = enregistrer_simulation(
            parametres,
            resultats,
            user_id
        )

        return {
            "success": True,
            "message": "Simulation réalisée avec succès.",
            "simulation_id": simulation_id,
            "resultats": resultats
        }

    except HTTPException:
        raise

    except Exception as e:

        print("ERREUR SIMULATION :", repr(e))

        raise HTTPException(
            status_code=500,
            detail=f"Erreur pendant la simulation : {str(e)}"
        )


# =========================================
# ETUDE PARAMETRIQUE
# =========================================

@app.post("/api/parametric")
def run_parametric_study(data: SimulationInput):

    try:

        parametres = data.to_calculation_dict()

        resultats = parametric_study(parametres)

        return {
            "success": True,
            "message": "Étude paramétrique réalisée avec succès.",
            **resultats
        }

    except Exception as e:

        print(
            "ERREUR ETUDE PARAMETRIQUE :",
            repr(e)
        )

        raise HTTPException(
            status_code=500,
            detail=f"Erreur pendant l'étude paramétrique : {str(e)}"
        )


# =========================================
# HISTORIQUE DES SIMULATIONS
# =========================================

@app.get("/api/history")
def get_history(request: Request):

    try:

        user_id = get_session_user_id(request)

        with closing(get_connection()) as conn:

            cursor = conn.cursor()

            if user_id:

                cursor.execute("""
                    SELECT
                        id,
                        date_simulation,
                        parametres,
                        resultats
                    FROM simulations
                    WHERE user_id = ?
                    ORDER BY id DESC
                """, (user_id,))

            else:

                cursor.execute("""
                    SELECT
                        id,
                        date_simulation,
                        parametres,
                        resultats
                    FROM simulations
                    WHERE user_id IS NULL
                    ORDER BY id DESC
                """)

            rows = cursor.fetchall()

            simulations = []

            for row in rows:

                simulations.append({
                    "id": row["id"],
                    "date_simulation": row["date_simulation"],
                    "parametres": json.loads(row["parametres"]),
                    "resultats": json.loads(row["resultats"])
                })

        return {
            "success": True,
            "total": len(simulations),
            "simulations": simulations
        }

    except Exception as e:

        print("ERREUR HISTORIQUE :", repr(e))

        raise HTTPException(
            status_code=500,
            detail=f"Erreur historique : {str(e)}"
        )


# =========================================
# SUPPRESSION D'UNE SIMULATION
# =========================================

@app.delete("/api/history/{simulation_id}")
def delete_simulation(
    simulation_id: int,
    request: Request
):

    user_id = get_session_user_id(request)

    with closing(get_connection()) as conn:

        cursor = conn.cursor()

        if user_id:

            cursor.execute("""
                DELETE FROM simulations
                WHERE id = ? AND user_id = ?
            """, (
                simulation_id,
                user_id
            ))

        else:

            cursor.execute("""
                DELETE FROM simulations
                WHERE id = ? AND user_id IS NULL
            """, (simulation_id,))

        conn.commit()

        if cursor.rowcount == 0:

            raise HTTPException(
                status_code=404,
                detail="Simulation introuvable."
            )

    return {
        "success": True,
        "message": "Simulation supprimée avec succès."
    }


# =========================================
# FICHIERS STATIQUES
# =========================================

if STATIC_DIR.exists():

    app.mount(
        "/static",
        StaticFiles(directory=STATIC_DIR),
        name="static"
    )
