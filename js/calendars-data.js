/**
 * calendars-data.js
 *
 * GESTIONNAIRE DE DONNÉES DES CALENDRIERS :
 * Utilise désormais DynamoDBService pour les appels.
 */
document.addEventListener('DOMContentLoaded', () => {
    const calendarSelect = document.getElementById('calendar-select');

    if (!calendarSelect) return;

    // Détermine le préfixe et le module
    const getModuleConfig = () => {
        const module = document.body.getAttribute('data-module') || 'vocal';
        const mapping = {
            'distribution': 'Cal_Distrib_',
            'cible': 'Cal_Cible_',
            'vocal': 'Cal_Vocal_'
        };
        return {
            module: module,
            prefix: mapping[module] || 'Cal_Vocal_'
        };
    };

    const getTargetTable = () => 'Core_Ddb_Calendriers';

    // Fonction pour charger les calendriers (exposée globalement)
    window.populateCalendarSelect = async function fetchCalendars() {
        try {
            // Afficher un état de chargement
            if (calendarSelect.options.length <= 1) calendarSelect.innerHTML = '<option value="">Chargement...</option>';

            const items = await window.dynamoDBService.scan(getTargetTable());
            const { prefix } = getModuleConfig();

            // Sauvegarder la sélection actuelle
            const currentVal = calendarSelect.value;
            // Vider et remplir la liste déroulante
            calendarSelect.innerHTML = '<option value="">Sélectionner...</option>';

            if (items && items.length > 0) {
                // Filtrer par préfixe
                const filteredItems = items.filter(item => item.id_Calendar && item.id_Calendar.startsWith(prefix));
                // Trier par nom
                filteredItems.sort((a, b) => (a.Nom || a.id_Calendar).localeCompare(b.Nom || b.id_Calendar));

                filteredItems.forEach(item => {
                    const option = document.createElement('option');
                    option.value = item.id_Calendar;
                    option.textContent = item.Nom || item.id_Calendar;
                    calendarSelect.appendChild(option);
                });

                // Restaurer si toujours présent
                if (currentVal) calendarSelect.value = currentVal;

            } else {
                calendarSelect.innerHTML = '<option value="">Aucun calendrier trouvé pour ce module.</option>';
            }
        } catch (err) {
            // L'erreur est déjà loguée et toastée par le service, mais on peut ajouter une logique spécifique UI ici si besoin
            calendarSelect.innerHTML = '<option value="">Erreur chargement</option>';
        }
    };

    // Compteur anti-race condition pour les changements rapides de sélection
    let loadRequestId = 0;

    // Écouteur pour la sélection d'un calendrier
    calendarSelect.addEventListener('change', async () => {
        const calendarId = calendarSelect.value;
        const mainContainer = document.getElementById('annual-calendar-container');
        const currentRequestId = ++loadRequestId;

        if (!calendarId) {
            window.currentCalendarData = null;
            if (mainContainer) mainContainer.classList.add('slds-hide');
            document.getElementById('edit-calendar-container')?.classList.add('slds-hide');
            return;
        }

        // Afficher un skeleton sur le conteneur principal
        if (mainContainer) {
            mainContainer.classList.remove('slds-hide');
            mainContainer.innerHTML = `
                <div class="slds-p-around_large">
                    <div class="slds-grid slds-gutters slds-wrap">
                        <div class="slds-col slds-size_1-of-1 slds-medium-size_1-of-4">
                            <div class="skeleton skeleton-calendar-side"></div>
                        </div>
                        <div class="slds-col slds-size_1-of-1 slds-medium-size_3-of-4">
                            <div class="skeleton skeleton-calendar-header"></div>
                            <div class="skeleton skeleton-calendar-body"></div>
                        </div>
                    </div>
                </div>`;
        }
        // Afficher le bouton d'édition (ou son conteneur)
        document.getElementById('edit-calendar-container')?.classList.remove('slds-hide');

        try {
            const item = await window.dynamoDBService.get(getTargetTable(), {'id_Calendar': calendarId});

            // Anti-race condition : ignorer si une requête plus récente a été lancée
            if (currentRequestId !== loadRequestId) return;

            window.currentCalendarData = item;

            // On demande à la page de "redessiner" le calendrier avec les nouvelles données
            if (typeof renderAnnualCalendar === 'function') {
                renderAnnualCalendar(window.calendarDisplayYear);
            }
        } catch (err) {
            if (currentRequestId !== loadRequestId) return;
            if (mainContainer) mainContainer.innerHTML = '<div class="slds-notify slds-notify_alert slds-theme_error" role="alert">Erreur de chargement</div>';
        }
    });

    // Lancer la récupération de la liste au démarrage
    window.populateCalendarSelect();
    if (window.addSearchFilter) window.addSearchFilter(calendarSelect, 'Rechercher un calendrier...');
});
