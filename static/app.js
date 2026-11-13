
"use strict";

// =====================================================
// 1. ELEMENTS HTML
// =====================================================

// Authentification
const authSection = document.getElementById("authSection");
const appContent = document.getElementById("appContent");
const authBar = document.getElementById("authBar");
const authUser = document.getElementById("authUser");
const authMessage = document.getElementById("authMessage");

const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const logoutButton = document.getElementById("logoutButton");

const showSignupButton = document.getElementById("showSignup");
const showLoginButton = document.getElementById("showLogin");

// Simulation
const form = document.getElementById("simulationForm");
const results = document.getElementById("results");
const message = document.getElementById("message");
const balance = document.getElementById("balance");

// Historique
const historyBody = document.getElementById("historyBody");
const historyMessage = document.getElementById("historyMessage");
const refreshHistoryButton = document.getElementById("refreshHistory");

// Graphiques
let evaporationChart = null;
let heatingChart = null;
let powerChart = null;


// =====================================================
// 2. OUTILS GENERAUX
// =====================================================

function formatNumber(value, decimals = 2) {
    const number = Number(value);

    return Number.isFinite(number)
        ? number.toFixed(decimals)
        : "N/A";
}


async function readResponse(response) {
    const text = await response.text();

    let data = {};

    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        throw new Error(
            "La réponse du serveur n'est pas un JSON valide."
        );
    }

    if (!response.ok) {
        throw new Error(
            data.detail ||
            data.message ||
            `Erreur HTTP ${response.status}`
        );
    }

    return data;
}


function showMessage(element, text, type = "") {
    if (!element) return;

    element.textContent = text;
    element.className = type;
}


// =====================================================
// 3. AFFICHAGE DES FORMULAIRES
// =====================================================

function displayLoginForm() {
    if (loginForm) loginForm.hidden = false;
    if (signupForm) signupForm.hidden = true;

    showAuthMessage("");
}


function displaySignupForm() {
    if (loginForm) loginForm.hidden = true;
    if (signupForm) signupForm.hidden = false;

    showAuthMessage("");
}


if (showSignupButton) {
    showSignupButton.addEventListener("click", displaySignupForm);
}


if (showLoginButton) {
    showLoginButton.addEventListener("click", displayLoginForm);
}


// =====================================================
// 4. GESTION DE LA SESSION
// =====================================================

function showAuthMessage(text, type = "") {
    showMessage(authMessage, text, type);
}


function showApplication(user) {
    if (authSection) authSection.hidden = true;
    if (appContent) appContent.hidden = false;
    if (authBar) authBar.hidden = false;

    if (authUser && user) {
        authUser.textContent = "Bienvenue, " + user.username;
    }

    loadHistory();
}


function showAuthentication() {
    if (authSection) authSection.hidden = false;
    if (appContent) appContent.hidden = true;
    if (authBar) authBar.hidden = true;

    displayLoginForm();
}


async function initializeAuthentication() {
    try {
        const response = await fetch("/api/auth/me", {
            method: "GET",
            credentials: "same-origin"
        });

        const data = await readResponse(response);

        if (data.authenticated && data.user) {
            showApplication(data.user);
        } else {
            showAuthentication();
        }

    } catch (error) {
        console.error("Erreur de session :", error);
        showAuthentication();
    }
}


// =====================================================
// 5. SIGN IN
// =====================================================

if (loginForm) {
    loginForm.addEventListener("submit", async function(event) {
        event.preventDefault();

        const email =
            document.getElementById("loginEmail").value.trim();

        const password =
            document.getElementById("loginPassword").value;

        showAuthMessage("Connexion en cours...");

        try {
            const response = await fetch("/api/auth/signin", {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                credentials: "same-origin",

                body: JSON.stringify({
                    email: email,
                    password: password
                })
            });

            const data = await readResponse(response);

            if (!data.user) {
                throw new Error(
                    "Les informations de l'utilisateur sont absentes."
                );
            }

            loginForm.reset();

            showApplication(data.user);

        } catch (error) {
            console.error("Erreur connexion :", error);

            showAuthMessage(error.message, "error");
        }
    });
}


// =====================================================
// 6. SIGN UP
// =====================================================

if (signupForm) {
    signupForm.addEventListener("submit", async function(event) {
        event.preventDefault();

        const username =
            document.getElementById("signupUsername").value.trim();

        const email =
            document.getElementById("signupEmail").value.trim();

        const password =
            document.getElementById("signupPassword").value;

        // ID exact de ton HTML
        const confirmPassword =
            document.getElementById("signupConfirmPassword").value;

        if (password.length < 8) {
            showAuthMessage(
                "Le mot de passe doit contenir au moins 8 caractères.",
                "error"
            );
            return;
        }

        if (password !== confirmPassword) {
            showAuthMessage(
                "Les mots de passe ne correspondent pas.",
                "error"
            );
            return;
        }

        showAuthMessage("Création du compte en cours...");

        try {
            const response = await fetch("/api/auth/signup", {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                credentials: "same-origin",

                body: JSON.stringify({
                    username: username,
                    email: email,
                    password: password,
                    confirm_password: confirmPassword
                })
            });

            const data = await readResponse(response);

            signupForm.reset();

            // Préremplir l'adresse e-mail pour la connexion
            const loginEmail =
                document.getElementById("loginEmail");

            if (loginEmail) {
                loginEmail.value = email;
            }

            displayLoginForm();

            showAuthMessage(
                data.message ||
                "Compte créé avec succès. Connectez-vous."
            );

        } catch (error) {
            console.error("Erreur inscription :", error);

            showAuthMessage(error.message, "error");
        }
    });
}


// =====================================================
// 7. LOG OUT
// =====================================================

if (logoutButton) {
    logoutButton.addEventListener("click", async function() {
        try {
            const response = await fetch("/api/auth/logout", {
                method: "POST",
                credentials: "same-origin"
            });

            const data = await readResponse(response);

            if (loginForm) loginForm.reset();

            showAuthentication();

            showAuthMessage(
                data.message || "Déconnexion réussie."
            );

        } catch (error) {
            console.error("Erreur déconnexion :", error);

            showAuthMessage(error.message, "error");
        }
    });
}


// =====================================================
// 8. RECUPERATION DES PARAMETRES
// =====================================================

function getData() {
    return {
        m0: Number(document.getElementById("m0").value),
        x0: Number(document.getElementById("x0").value),
        residus: Number(document.getElementById("residus").value),
        mR: Number(document.getElementById("mR").value),
        xR: Number(document.getElementById("xR").value),
        Cp: Number(document.getElementById("Cp").value),
        T2: Number(document.getElementById("T2").value),
        T3: Number(document.getElementById("T3").value),
        x4: Number(document.getElementById("x4").value),
        lambda: Number(document.getElementById("lambda").value),
        T5: Number(document.getElementById("T5").value)
    };
}


// =====================================================
// 9. VALIDATION DES PARAMETRES
// =====================================================

function validateData(data) {
    for (const [key, value] of Object.entries(data)) {
        if (!Number.isFinite(value)) {
            throw new Error(`Le paramètre ${key} est invalide.`);
        }
    }

    if (data.m0 <= 0) {
        throw new Error(
            "Le débit initial doit être supérieur à zéro."
        );
    }

    if (data.Cp <= 0 || data.lambda <= 0) {
        throw new Error(
            "Cp et lambda doivent être positifs."
        );
    }

    if (
        data.x0 < 0 || data.x0 > 100 ||
        data.xR < 0 || data.xR > 100 ||
        data.x4 <= 0 || data.x4 > 100
    ) {
        throw new Error(
            "Les concentrations doivent être comprises entre 0 et 100 %."
        );
    }

    if (data.residus < 0 || data.residus > data.m0) {
        throw new Error(
            "La quantité de résidus est invalide."
        );
    }

    if (data.mR < 0) {
        throw new Error(
            "Le débit ajouté ne peut pas être négatif."
        );
    }

    if (data.T3 <= data.T2) {
        throw new Error(
            "T3 doit être supérieure à T2."
        );
    }

    if (data.T5 > data.T3) {
        throw new Error(
            "T5 doit être inférieure ou égale à T3."
        );
    }
}


// =====================================================
// 10. CREATION DES GRAPHIQUES
// =====================================================

function createChart(canvasId, oldChart, type, labels, datasets) {
    if (oldChart) {
        oldChart.destroy();
    }

    const canvas = document.getElementById(canvasId);

    if (!canvas) {
        console.warn("Canvas introuvable :", canvasId);
        return null;
    }

    if (typeof Chart === "undefined") {
        console.error("Chart.js n'est pas chargé.");
        return null;
    }

    return new Chart(canvas, {
        type: type,

        data: {
            labels: labels,
            datasets: datasets
        },

        options: {
            responsive: true,
            maintainAspectRatio: true,

            plugins: {
                legend: {
                    display: true,
                    position: "bottom"
                }
            },

            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}


// =====================================================
// 11. AFFICHAGE DES RESULTATS
// =====================================================

function displayResults(result) {
    if (!results) return;

    const labels = {
        m1: "Débit après filtration",
        x1: "Concentration après filtration",
        m2: "Débit après mélange",
        x2: "Concentration après mélange",
        Q3: "Puissance de chauffage",
        m4: "Débit final de jus",
        mv: "Débit de vapeur évaporée",
        Q4: "Puissance d'évaporation",
        Q5: "Puissance de refroidissement"
    };

    const units = {
        m1: "kg/h",
        x1: "%",
        m2: "kg/h",
        x2: "%",
        Q3: "kW",
        m4: "kg/h",
        mv: "kg/h",
        Q4: "kW",
        Q5: "kW"
    };

    results.innerHTML = "";

    for (const key in labels) {
        results.innerHTML += `
            <div class="result-card">
                <h4>${labels[key]}</h4>
                <p>${formatNumber(result[key])} ${units[key]}</p>
            </div>
        `;
    }
}


// =====================================================
// 12. BILAN DE MATIERE
// =====================================================

function displayBalance(result) {
    if (!balance) return;

    const balanceItems = [
        {
            key: "soluble_in",
            label: "Matière soluble entrante",
            unit: "kg/h"
        },
        {
            key: "soluble_out",
            label: "Matière soluble sortante",
            unit: "kg/h"
        },
        {
            key: "water_in",
            label: "Eau entrante",
            unit: "kg/h"
        },
        {
            key: "water_out",
            label: "Eau sortante",
            unit: "kg/h"
        },
        {
            key: "total_in",
            label: "Entrée totale",
            unit: "kg/h"
        },
        {
            key: "total_out",
            label: "Sortie totale",
            unit: "kg/h"
        },
        {
            key: "error_soluble",
            label: "Erreur bilan soluble",
            unit: "kg/h"
        },
        {
            key: "error_water",
            label: "Erreur bilan eau",
            unit: "kg/h"
        },
        {
            key: "error_global",
            label: "Erreur bilan global",
            unit: "kg/h"
        }
    ];

    balance.innerHTML = "";

    balanceItems.forEach(item => {
        balance.innerHTML += `
            <div class="result-card">
                <h4>${item.label}</h4>
                <p>${formatNumber(result[item.key], 6)} ${item.unit}</p>
            </div>
        `;
    });
}


// =====================================================
// 13. HISTORIQUE DES SIMULATIONS
// =====================================================

function safeValue(value) {
    if (value === null || value === undefined) {
        return "N/A";
    }

    return String(value);
}


async function loadHistory() {
    if (!historyBody || !historyMessage) return;

    historyMessage.textContent =
        "Chargement de l'historique...";

    historyBody.innerHTML = "";

    try {
        const response = await fetch("/api/history", {
            method: "GET",
            credentials: "same-origin"
        });

        const data = await readResponse(response);

        const simulations = data.simulations || [];

        if (simulations.length === 0) {
            historyMessage.textContent =
                "Aucune simulation enregistrée.";
            return;
        }

        historyMessage.textContent =
            `${simulations.length} simulation(s) enregistrée(s).`;

        simulations.forEach(simulation => {
            const params = simulation.parametres || {};
            const resultats = simulation.resultats || {};

            const date = simulation.date_simulation
                ? new Date(
                    simulation.date_simulation
                ).toLocaleString("fr-FR")
                : "Date inconnue";

            const row = document.createElement("tr");

            const values = [
                safeValue(simulation.id),
                date,
                safeValue(params.m0),
                safeValue(params.x0),
                safeValue(resultats.m4),
                safeValue(resultats.mv)
            ];

            values.forEach(value => {
                const cell = document.createElement("td");
                cell.textContent = value;
                row.appendChild(cell);
            });

            const actionCell = document.createElement("td");

            const deleteButton =
                document.createElement("button");

            deleteButton.type = "button";
            deleteButton.className = "btn-delete";
            deleteButton.textContent = "Supprimer";
            deleteButton.dataset.id = simulation.id;

            actionCell.appendChild(deleteButton);
            row.appendChild(actionCell);

            historyBody.appendChild(row);
        });

    } catch (error) {
        console.error("Erreur historique :", error);

        historyMessage.textContent =
            "Erreur : " + error.message;
    }
}


// =====================================================
// 14. SUPPRESSION D'UNE SIMULATION
// =====================================================

async function deleteSimulation(simulationId) {
    const confirmation = confirm(
        `Voulez-vous vraiment supprimer la simulation ${simulationId} ?`
    );

    if (!confirmation) return;

    try {
        const response = await fetch(
            `/api/history/${simulationId}`,
            {
                method: "DELETE",
                credentials: "same-origin"
            }
        );

        const data = await readResponse(response);

        historyMessage.textContent =
            data.message || "Simulation supprimée avec succès.";

        await loadHistory();

    } catch (error) {
        console.error(error);

        historyMessage.textContent =
            "Erreur : " + error.message;
    }
}


if (historyBody) {
    historyBody.addEventListener("click", function(event) {
        const button = event.target.closest(".btn-delete");

        if (button) {
            deleteSimulation(button.dataset.id);
        }
    });
}


if (refreshHistoryButton) {
    refreshHistoryButton.addEventListener("click", loadHistory);
}


// =====================================================
// 15. ETUDE PARAMETRIQUE
// =====================================================

function displayParametricCharts(param) {
    const concentration = param.concentration;
    const temperature = param.temperature;

    if (
        !Array.isArray(concentration) ||
        !Array.isArray(temperature)
    ) {
        console.warn(
            "Les données paramétriques sont absentes.",
            param
        );

        return false;
    }

    if (concentration.length > 0) {
        evaporationChart = createChart(
            "evaporationChart",
            evaporationChart,
            "line",

            concentration.map(item => item.x4 + "%"),

            [{
                label: "Vapeur évaporée (kg/h)",

                data: concentration.map(
                    item => Number(item.mv)
                ),

                borderWidth: 3,
                tension: 0.3
            }]
        );
    }

    if (temperature.length > 0) {
        heatingChart = createChart(
            "heatingChart",
            heatingChart,
            "line",

            temperature.map(item => item.T3 + "°C"),

            [{
                label: "Puissance de chauffage (kW)",

                data: temperature.map(
                    item => Number(item.Q3)
                ),

                borderWidth: 3,
                tension: 0.3
            }]
        );
    }

    return true;
}


// =====================================================
// 16. GRAPHIQUE DE COMPARAISON DES PUISSANCES
// =====================================================

function displayPowerChart(result) {
    powerChart = createChart(
        "powerChart",
        powerChart,
        "bar",

        [
            "Chauffage",
            "Évaporation",
            "Refroidissement"
        ],

        [{
            label: "Puissance (kW)",

            data: [
                Number(result.Q3),
                Number(result.Q4),
                Number(result.Q5)
            ]
        }]
    );
}


// =====================================================
// 17. LANCEMENT DE LA SIMULATION
// =====================================================

if (form) {
    form.addEventListener("submit", async function(event) {
        event.preventDefault();

        showMessage(message, "Calcul en cours...");

        if (results) results.innerHTML = "";
        if (balance) balance.innerHTML = "";

        try {
            const data = getData();

            validateData(data);

            // Simulation principale
            const response = await fetch("/api/simulate", {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                credentials: "same-origin",

                body: JSON.stringify(data)
            });

            const responseData = await readResponse(response);

            // Le backend retourne "resultats"
            const result = responseData.resultats;

            if (!result) {
                throw new Error(
                    "Les résultats sont absents de la réponse API."
                );
            }

            // Affichage des résultats
            displayResults(result);

            // Bilan de matière
            displayBalance(result);

            // Graphique des puissances
            displayPowerChart(result);

            // Actualisation de l'historique
            await loadHistory();

            // Etude paramétrique
            let parametricMessage = "";

            try {
                const paramResponse = await fetch(
                    "/api/parametric",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type": "application/json"
                        },

                        credentials: "same-origin",

                        body: JSON.stringify(data)
                    }
                );

                const param = await readResponse(paramResponse);

                const chartsCreated =
                    displayParametricCharts(param);

                if (!chartsCreated) {
                    parametricMessage =
                        " Les données des graphiques paramétriques sont absentes.";
                }

            } catch (paramError) {
                console.error(
                    "Erreur étude paramétrique :",
                    paramError
                );

                parametricMessage =
                    " L'étude paramétrique a rencontré une erreur : " +
                    paramError.message;
            }

            showMessage(
                message,
                "Simulation réalisée avec succès !" +
                parametricMessage,
                parametricMessage ? "error" : ""
            );

        } catch (error) {
            console.error("Erreur simulation :", error);

            showMessage(
                message,
                "Erreur : " + error.message,
                "error"
            );
        }
    });
}


// =====================================================
// 18. INITIALISATION
// =====================================================

// Vérifier la session avant d'afficher l'application
initializeAuthentication();
