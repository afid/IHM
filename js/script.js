/**
 * script.js
 * Ce fichier contient toute l'intelligence du site :
 * - L'ouverture/fermeture du menu sur mobile.
 * - Le système de menu qui se déplie (accordéon).
 * - La gestion de la fenêtre d'aide.
 * - Le bandeau défilant des informations.
 * - La création automatique du calendrier.
 * 🟥 🟧 🟨 🟩 🟦 🟪 🟫 ⬛ ⬜ 🔳 🔲
 */

// Guard : empêche l'accumulation de listeners si layout-loaded est émis plusieurs fois
let scriptInitialized = false;
document.addEventListener('layout-loaded', () => {
    if (scriptInitialized) return;
    scriptInitialized = true;

    // --- GESTION DU MENU SUR MOBILE ---
    const toggleBtn = document.getElementById('mobileSidebarToggle');
    const sidebar = document.getElementById('sidebar');

    if (toggleBtn && sidebar) {
        // Quand on clique sur le bouton "☰"
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Empêche le clic de se propager ailleurs
            sidebar.classList.toggle('is-open'); // Alterne entre ouvert et fermé
        });

        // Pour fermer le menu si on clique n'importe où ailleurs sur l'écran
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768) { // Seulement sur mobile
                if (!sidebar.contains(e.target) && !toggleBtn.contains(e.target) && sidebar.classList.contains('is-open')) {
                    sidebar.classList.remove('is-open');
                }
            }
        });
    }

    // --- LE MENU ACCORDÉON (Menu qui se déplie) ---
    const accordionHeaders = document.querySelectorAll('.accordion-header');

    accordionHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const section = header.parentElement;
            const isOpen = section.classList.contains('is-open');

            // On ferme toutes les autres sections avant d'ouvrir celle-ci
            const allSections = document.querySelectorAll('.accordion-section');
            allSections.forEach(s => s.classList.remove('is-open'));

            // Si elle n'était pas ouverte, on l'ouvre
            if (!isOpen) {
                section.classList.add('is-open');
            }
        });
    });

    // --- LOGIQUE DE LA FENÊTRE D'AIDE (MODALE) ---
    const helpBtn = document.getElementById('help-icon-btn'); // Le bouton d'aide (?) sur la page
    const helpModal = document.getElementById('help-modal');
    const modalBackdrop = document.getElementById('modal-backdrop');
    const modalCloseBtns = [
        document.getElementById('modal-close-btn'),
        document.getElementById('modal-footer-close')
    ];
    const helpTextElement = document.getElementById('help-text');
    const modalTitle = document.getElementById('modal-heading');

    // On définit ici les textes d'aide pour chaque page
    const helpContent = {
        'index.html': {
            title: 'Aide - Accueil',
            text: 'Bienvenue sur votre portail de pilotage. Utilisez le menu latéral pour naviguer entre les différents tableaux de bord.'
        },
        'calendrier_vocal.html': {
            title: 'Aide - Calendriers',
            url: 'help/guide-calendrier.html'
        },
        'calendrier_distribution.html': {
            title: 'Aide - Calendriers',
            url: 'help/guide-calendrier.html'
        },
        'calendrier_cible.html': {
            title: 'Aide - Calendriers',
            url: 'help/guide-calendrier.html'
        },
        'parametrage_dnis.html': {
            title: 'Aide - Paramétrage des DNIS',
            url: 'help/guide-dnis.html'
        },
        'parametrage_structures.html': {
            title: 'Aide - Paramétrage des Structures',
            url: 'help/guide-structures.html'
        },
        'parametrage_segments.html': {
            title: 'Aide - Paramétrage des Segments',
            url: 'help/guide-segments.html'
        },
        'creer_situations.html': {
            title: 'Aide - Gestion des Situations',
            url: 'help/guide-situations.html'
        },
        'activation_situation.html': {
            title: 'Aide - Activer une Situation',
            url: 'help/guide-activation.html'
        }
    };

    // Fonction pour ouvrir la fenêtre
    function openModal() {
        const currentFile = window.location.pathname.split('/').pop() || 'index.html';
        const content = helpContent[currentFile] || helpContent['index.html'];

        if (helpTextElement && modalTitle) {
            modalTitle.textContent = content.title;

            // Si une URL est définie, on utilise un iframe
            if (content.url) {
                // On retire le padding de l'élément parent pour que l'iframe soit bord à bord si besoin
                if (helpTextElement.parentElement) {
                    helpTextElement.parentElement.style.padding = '0';
                }
                helpTextElement.innerHTML = `<iframe src="${content.url}" style="width: 100%; height: 75vh; border: none; display: block;"></iframe>`;
            } else {
                // Sinon on injecte le texte HTML classique
                if (helpTextElement.parentElement) {
                    helpTextElement.parentElement.style.padding = ''; // On remet le padding Salesforce
                }
                helpTextElement.innerHTML = content.text;
            }
        }

        helpModal.classList.add('slds-fade-in-open'); // Affiche la fenêtre
        modalBackdrop.classList.add('slds-backdrop_open'); // Affiche le fond gris
    }

    // Fonction pour fermer la fenêtre
    function closeModal() {
        helpModal.classList.remove('slds-fade-in-open');
        modalBackdrop.classList.remove('slds-backdrop_open');
    }

    // Fonctions pour ouvrir/fermer la fenêtre
    // C'est ici qu'on dit : "quand je clique sur la croix, la fenêtre disparaît"
    if (helpBtn) {
        helpBtn.addEventListener('click', openModal);
    }

    modalCloseBtns.forEach(btn => {
        if (btn) btn.addEventListener('click', closeModal);
    });

    // Si on clique sur le fond gris (à l'extérieur de la fenêtre), ça ferme aussi
    if (modalBackdrop) {
        modalBackdrop.addEventListener('click', closeModal);
    }

    // --- LE BANDEAU DÉFILANT D'INFOS (NEWS TICKER) ---
    const tickerContainer = document.getElementById('newsTicker');
    const ROTATION_SPEED = 5000; // Vitesse de défilement : 5 secondes

    // On récupère les infos (souvent stockées dans un autre fichier)
    let newsItems = window.APP_NEWS || [
        "⚠️ Erreur : Les données de nouvelles n'ont pas pu être chargées.",
        "💡 Astuce : Vérifiez que news/news.js est correctement lié."
    ];
    let currentIndex = 0;

    // Initialisation
    function initNews() {
        if (newsItems.length > 0) {
            renderNews();
            startTicker();
        }
    }

    // Dessine les nouvelles sur la page (au début elles sont cachées)
    function renderNews() {
        if (!tickerContainer) return;
        tickerContainer.innerHTML = newsItems.map((item, index) =>
            `<span class="news-item ${index === 0 ? 'active' : ''}">${item}</span>`
        ).join('');
    }

    // Fait défiler les messages un par un
    function startTicker() {
        if (newsItems.length <= 1 || !tickerContainer) return;

        setInterval(() => {
            const items = tickerContainer.querySelectorAll('.news-item');
            if (items.length === 0) return;

            // Fait sortir le message actuel
            items[currentIndex].classList.remove('active');
            items[currentIndex].classList.add('exit');

            // Calcule quel est le prochain message
            const nextIndex = (currentIndex + 1) % newsItems.length;

            // Fait entrer le message suivant
            items[nextIndex].classList.remove('exit');
            items[nextIndex].classList.add('active');

            // Enregistre que maintenant c'est celui-ci le message actuel
            currentIndex = nextIndex;

            // Petit nettoyage après l'animation (500ms après)
            setTimeout(() => {
                items.forEach((item, idx) => {
                    if (idx !== currentIndex) item.classList.remove('exit');
                });
            }, 500);
        }, ROTATION_SPEED);
    }

    // --- LOGIQUE DE SÉLECTION DU CALENDRIER ---
    const calendarSelect = document.getElementById('calendar-select');
    const editCalendarContainer = document.getElementById('edit-calendar-container');
    const annualCalendarContainer = document.getElementById('annual-calendar-container');

    if (calendarSelect && editCalendarContainer && annualCalendarContainer) {
        calendarSelect.addEventListener('change', () => {
            if (calendarSelect.value !== "") {
                // Les outils sont montrés, mais le rendu est maintenant géré par calendars-data.js
                // qui a récupéré les données complètes de DynamoDB.
                editCalendarContainer.classList.remove('slds-hide');
                annualCalendarContainer.classList.remove('slds-hide');
            } else {
                editCalendarContainer.classList.add('slds-hide');
                annualCalendarContainer.classList.add('slds-hide');
                annualCalendarContainer.innerHTML = '';
            }
        });
    }

    // --- LOGIQUE DE DÉCONNEXION ---
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            sessionStorage.removeItem('ihm_auth_user');
            window.location.href = 'login.html';
        });
    }

    // On lance le bandeau de news
    initNews();
});

// Variable globale pour suivre l'année affichée sur le calendrier annuel
window.calendarDisplayYear = new Date().getFullYear();

/**
 * CHANGE L'ANNÉE DU CALENDRIER ET LE REDESSINE
 */
window.changeCalendarYear = function (delta) {
    window.calendarDisplayYear += delta;
    if (typeof renderAnnualCalendar === 'function') {
        renderAnnualCalendar(window.calendarDisplayYear);
    }
};

/**
 * DESSINE LE CALENDRIER DE TOUTE UNE ANNÉE
 */
window.renderAnnualCalendar = renderAnnualCalendar;
function renderAnnualCalendar(year) {
    const annualCalendarContainer = document.getElementById('annual-calendar-container');
    if (!annualCalendarContainer) return;

    const months = [
        'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
        'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
    ];
    const daysShort = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];

    let html = `
        <div class="slds-grid slds-grid_vertical-align-center slds-grid_align-center slds-m-bottom_large year-navigation">
            <button class="slds-button slds-button_icon slds-button_icon-border-filled" onclick="changeCalendarYear(-1)" title="Année précédente">
                <span style="font-size: 1.5rem;">⬅️</span>
            </button>
            <h2 class="slds-text-heading_large slds-m-horizontal_medium" style="font-family: 'Khand'; font-weight: bold; color: #0070d2;">
                ${year}
            </h2>
            <button class="slds-button slds-button_icon slds-button_icon-border-filled" onclick="changeCalendarYear(1)" title="Année suivante">
                <span style="font-size: 1.5rem;">➡️</span>
            </button>
        </div>
        <div class="slds-grid slds-gutters slds-wrap">
    `;

    months.forEach((month, index) => {
        html += `
                <div class="slds-col slds-size_1-of-1 slds-medium-size_1-of-2 slds-large-size_1-of-3 slds-xlarge-size_1-of-4 slds-m-bottom_medium">
                        <div class="month-block">
                            <div class="month-header">${month} ${year}</div>
                            <div class="weekday-header">
                                ${daysShort.map(day => `<div>${day}</div>`).join('')}
                            </div>
                            <div class="days-grid">
                                ${generateDaysForMonth(year, index)}
                            </div>
                        </div>
                </div>
        `;
    });

    html += `</div>`;
    // On met tout le HTML généré à l'intérieur de la zone prévue sur la page
    annualCalendarContainer.innerHTML = html;
}

/**
 * GÉNÈRE LES CHIFFRES (JOURS) POUR UN MOIS DONNÉ AVEC COLORATION ET TOOLTIPS
 */
function generateDaysForMonth(year, month) {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    let firstDayIndex = firstDay.getDay();
    firstDayIndex = firstDayIndex === 0 ? 6 : firstDayIndex - 1;

    const totalDays = lastDay.getDate();
    let daysHtml = '';

    for (let i = 0; i < firstDayIndex; i++) {
        daysHtml += `<div class="day-cell empty">-</div>`;
    }

    const data = window.currentCalendarData;
    const dayNamesFr = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

    // Mapping des statuts vers icônes et classes CSS
    const statusConfig = {
        "Ouvert": { icon: "⬜", class: "day-open", label: "Ouvert" },
        "OuvertSansAttente": { icon: "🔲", class: "day-open-no-wait", label: "Ouvert sans attente" },
        "PreFermeture": { icon: "🔳", class: "day-pre-closed", label: "Pré-fermeture" },
        "Ferme": { icon: "⬛", class: "day-closed", label: "Fermé" },
        "FermetureExeptionelle": { icon: "🟫", class: "day-exception-closed", label: "Fermeture exceptionnelle" },
        "FermetureHebdomadaire": { icon: "🟧", class: "day-weekly-closed", label: "Fermeture hebdomadaire" },
        "FermetureJourFerie": { icon: "🟥", class: "day-holiday-closed", label: "Fermeture jour férié" }
    };

    for (let day = 1; day <= totalDays; day++) {
        const currentDate = new Date(year, month, day);
        const dateStr = `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`;
        const dayOfWeekFr = dayNamesFr[currentDate.getDay()];

        let statusClass = '';
        let specialBorderClass = '';
        let tooltipText = '';

        if (data) {
            const isDistribution = document.body.getAttribute('data-module') === 'distribution';
            const formatSlots = (slotsObj) => {
                const sortedEntries = Object.entries(slotsObj).sort((a, b) => a[0].localeCompare(b[0]));
                return sortedEntries.map(([slot, info]) => {
                    const cfg = statusConfig[info.Status] || { icon: "❓", label: info.Status };
                    const actionText = (!isDistribution && info.Action) ? ` (${info.Action})` : '';
                    return `${cfg.icon} ${slot} : ${cfg.label}${actionText}`;
                }).join('\n');
            };

            // 1. Priorité : Exception
            if (data.JourExceptionnel && data.JourExceptionnel[dateStr]) {
                specialBorderClass = 'day-has-exception';
                const slots = data.JourExceptionnel[dateStr];
                const allDaySlot = slots["00:00-23:59"];

                if (allDaySlot && statusConfig[allDaySlot.Status]) {
                    const cfg = statusConfig[allDaySlot.Status];
                    statusClass = cfg.class;
                    const label = (slots && slots.Label) ? ` (${slots.Label})` : '';
                    tooltipText = `${cfg.icon} EXCEPTION${label} :\n${cfg.label.toUpperCase()} TOUTE LA JOURNÉE`;
                } else {
                    statusClass = 'day-exception-closed'; // Fallback exception
                    const label = (slots && slots.Label) ? ` (${slots.Label})` : '';
                    tooltipText = `💎 EXCEPTION${label} :\n${formatSlots(slots.Slots || slots)}`;
                    // Si on a plusieurs créneaux, on cherche si l'un est ouvert
                    const slotsToCheck = slots.Slots || slots;
                    const hasOpen = Object.values(slotsToCheck).some(s => s.Status && s.Status.startsWith('Ouvert'));
                    if (hasOpen) statusClass = 'day-open';
                }
            }


            // 2. Secondaire : Semaine Type
            if (!statusClass && data.Jour && data.Jour[dayOfWeekFr]) {
                const slots = data.Jour[dayOfWeekFr];
                const allDaySlot = slots["00:00-23:59"];
                if (allDaySlot && statusConfig[allDaySlot.Status]) {
                    const cfg = statusConfig[allDaySlot.Status];
                    statusClass = cfg.class;
                    tooltipText = `${cfg.icon} SEMAINE TYPE :\n${cfg.label.toUpperCase()} TOUTE LA JOURNÉE`;
                } else if (Object.keys(slots).length > 0) {
                    statusClass = 'day-open';
                    tooltipText = `✒️ SEMAINE TYPE (${dayOfWeekFr}) :\n${formatSlots(slots)}`;
                    const allFerme = Object.values(slots).every(s => s.Status.includes('Ferme') || s.Status.includes('Fermeture'));
                    if (allFerme) statusClass = 'day-closed';
                }
            }
        }

        const today = new Date();
        const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
        const currentYearClass = isToday ? 'today' : '';
        const dayIndexClass = `day-index-${currentDate.getDay()}`;

        daysHtml += `<div class="day-cell ${currentYearClass} ${statusClass} ${specialBorderClass} ${dayIndexClass}"
                          ${tooltipText ? `data-tooltip="${tooltipText.replace(/"/g, '&quot;')}"` : ''}>${day}</div>`;
    }

    return daysHtml;
}
