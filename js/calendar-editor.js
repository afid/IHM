/**
 * calendar-editor.js
 *
 * LE CERVEAU DE L'ÉDITEUR :
 * Utilise désormais DynamoDBService pour sauvegarder et supprimer.
 */

document.addEventListener('DOMContentLoaded', () => {
    // Détermine si on est sur le module de distribution (sans actions)
    const shouldHideActions = () => {
        return document.body.getAttribute('data-module') === 'cible';
    };

    // Détermine le label approprié pour le champ Action selon le module
    const getActionLabel = () => {
        const module = document.body.getAttribute('data-module') || 'vocal';
        if (module === 'distribution') {
            return 'Parcours';
        } else {
            return 'Module';
        }
    };

    // Détermine la table DynamoDB à utiliser
    const getTargetTable = () => 'Core_Ddb_Calendriers';

    // Force l'ajout du préfixe si manquant
    const enforcePrefix = (id) => {
        const module = document.body.getAttribute('data-module') || 'vocal';
        const mapping = {
            'distribution': 'Cal_Distrib_',
            'cible': 'Cal_Cible_',
            'vocal': 'Cal_Vocal_'
        };
        const prefix = mapping[module] || 'Cal_Vocal_';
        if (id && !id.startsWith(prefix)) {
            return prefix + id;
        }
        return id;
    };

    // --- BOUTONS ET ÉLÉMENTS DE L'INTERFACE ---
    const editorModal = document.getElementById('calendar-editor-modal');
    const editorBackdrop = document.getElementById('editor-backdrop');
    const editBtn = document.getElementById('edit-calendar-btn');
    const closeBtn = document.getElementById('close-editor-btn');
    const cancelBtn = document.getElementById('cancel-editor-btn');
    const saveBtn = document.getElementById('save-calendar-btn');
    const calendarNameSpan = document.getElementById('editor-calendar-name');
    const timeZoneInput = document.getElementById('editor-timezone');

    const weeklyEditorContent = document.getElementById('weekly-editor-content');
    const exceptionEditorContent = document.getElementById('exception-editor-content');

    const addExceptionBtn = document.getElementById('add-exception-btn');

    // --- BUTTONS DUPLICATE ---
    const duplicateBtn = document.getElementById('duplicate-calendar-btn');
    const deleteBtn = document.getElementById('delete-calendar-btn');
    const duplicateModal = document.getElementById('duplicate-modal');
    const duplicateBackdrop = document.getElementById('duplicate-backdrop');
    const closeDuplicateBtn = document.getElementById('close-duplicate-btn');
    const cancelDuplicateBtn = document.getElementById('cancel-duplicate-btn');
    const confirmDuplicateBtn = document.getElementById('confirm-duplicate-btn');

    // --- BUTTONS CREATE ---
    const createBtn = document.getElementById('new-calendar-btn');
    const createModal = document.getElementById('create-modal');
    const createBackdrop = document.getElementById('create-backdrop');
    const closeCreateBtn = document.getElementById('close-create-btn');
    const cancelCreateBtn = document.getElementById('cancel-create-btn');
    const confirmCreateBtn = document.getElementById('confirm-create-btn');

    // --- EDIT EXCEPTION MODAL ---
    const editExceptionModal = document.getElementById('edit-exception-modal');
    const editExceptionBackdrop = document.getElementById('edit-exception-backdrop');
    const closeEditExceptionBtn = document.getElementById('close-edit-exception-btn');
    const cancelEditExceptionBtn = document.getElementById('cancel-edit-exception-btn');
    const confirmEditExceptionBtn = document.getElementById('confirm-edit-exception-btn');
    let currentEditingExceptionDate = null;
    const editorGuard = window.createUnsavedChangesGuard ? window.createUnsavedChangesGuard('calendar-editor-modal') : null;

    // --- GESTION ÉDITION EXCEPTION ---
    window.openEditExceptionModal = function (date) {
        currentEditingExceptionDate = date;
        const [d, m, y] = date.split('/');
        const isoDate = `${y}-${m}-${d}`;

        document.getElementById('edit-exception-date').value = isoDate;
        document.getElementById('edit-exception-label').value = localCalendarData.JourExceptionnel[date]._Label || "";

        editExceptionModal.classList.add('slds-fade-in-open');
        editExceptionBackdrop.classList.add('slds-backdrop_open');
    };

    function closeEditExceptionModal() {
        editExceptionModal.classList.remove('slds-fade-in-open');
        editExceptionBackdrop.classList.remove('slds-backdrop_open');
        currentEditingExceptionDate = null;
    }

    function confirmEditException() {
        const newDateInput = document.getElementById('edit-exception-date');
        const newLabelInput = document.getElementById('edit-exception-label');

        if (!newDateInput.value) {
            showToast("Veuillez sélectionner une date.", "error");
            return;
        }

        const [y, m, d] = newDateInput.value.split('-');
        const newDateFr = `${d}/${m}/${y}`;
        const newLabel = newLabelInput.value.trim();

        const oldDate = currentEditingExceptionDate;

        if (newDateFr !== oldDate && localCalendarData.JourExceptionnel[newDateFr]) {
            showToast("Une exception existe déjà à cette date.", "error");
            return;
        }

        // Si la date a changé, on déplace les données
        if (newDateFr !== oldDate) {
            localCalendarData.JourExceptionnel[newDateFr] = localCalendarData.JourExceptionnel[oldDate];
            delete localCalendarData.JourExceptionnel[oldDate];
        }

        // Mise à jour du libellé
        localCalendarData.JourExceptionnel[newDateFr]._Label = newLabel;

        closeEditExceptionModal();
        refreshEditor();
        showToast("Exception mise à jour avec succès.", "success");
    }

    if (closeEditExceptionBtn) closeEditExceptionBtn.addEventListener('click', closeEditExceptionModal);
    if (cancelEditExceptionBtn) cancelEditExceptionBtn.addEventListener('click', closeEditExceptionModal);
    if (confirmEditExceptionBtn) confirmEditExceptionBtn.addEventListener('click', confirmEditException);

    let localCalendarData = null;
    let allParcours = [];
    let allActions = [];

    /**
     * Charge les parcours et actions disponibles si on est en mode distribution
     */
    async function loadDistributionData() {
        if (document.body.getAttribute('data-module') !== 'distribution') return;
        try {
            // Parcours
            const parcoursTable = 'Core_Ddb_CiblageParametrageParcours';
            const parcoursItems = await window.dynamoDBService.scan(parcoursTable);
            allParcours = parcoursItems || [];
            allParcours.sort((a, b) => (a.Parcours || '').localeCompare(b.Parcours || ''));

            // Actions
            const actionsTable = 'Core_Ddb_EnchainementParametrageActions';
            const actionsItems = await window.dynamoDBService.scan(actionsTable);
            allActions = actionsItems || [];
            allActions.sort((a, b) => (a.Action || '').localeCompare(b.Action || ''));

        } catch (err) {
            console.error("Erreur lors du chargement des données de distribution:", err);
        }
    }

    // Lancer le chargement au démarrage
    loadDistributionData();



    // --- GESTION DES ONGLETS ---
    const tabLinks = document.querySelectorAll('.slds-tabs_default__link');
    const tabContents = document.querySelectorAll('.slds-tabs_default__content');
    const tabItems = document.querySelectorAll('.slds-tabs_default__item');

    tabLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const targetId = link.getAttribute('aria-controls');

            // Masquer tous les contenus et désactiver les onglets
            tabContents.forEach(content => content.classList.replace('slds-show', 'slds-hide'));
            tabItems.forEach(item => item.classList.remove('slds-is-active'));

            // Afficher le contenu cible et activer l'onglet
            document.getElementById(targetId).classList.replace('slds-hide', 'slds-show');
            link.parentElement.classList.add('slds-is-active');
        });
    });

    // --- OUVERTURE / FERMETURE ---
    function openEditor() {
        if (!window.currentCalendarData) return;

        // On crée une copie de travail mais avec une structure de LISTE pour les créneaux
        // pour préserver l'ordre d'insertion et permettre des champs vides.
        const sourceData = JSON.parse(JSON.stringify(window.currentCalendarData));
        localCalendarData = transformToArrays(sourceData);

        if (calendarNameSpan) calendarNameSpan.textContent = localCalendarData.Nom || localCalendarData.id_Calendar;

        const tzInput = document.getElementById('editor-timezone');
        const nameInput = document.getElementById('editor-name');

        if (nameInput) {
            nameInput.value = localCalendarData.Nom || "";
            nameInput.onchange = (e) => {
                if (localCalendarData) {
                    localCalendarData.Nom = e.target.value;
                    calendarNameSpan.textContent = e.target.value || localCalendarData.id_Calendar;
                }
            };
        }

        if (tzInput) {
            const currentTZ = localCalendarData.TimeZone || 'Europe/Paris';

            // Check if option exists
            let optionExists = false;
            for (let i = 0; i < tzInput.options.length; i++) {
                if (tzInput.options[i].value === currentTZ) {
                    optionExists = true;
                    break;
                }
            }

            // If not, add it temporarily
            if (!optionExists) {
                const newOpt = document.createElement('option');
                newOpt.value = currentTZ;
                newOpt.text = currentTZ;
                tzInput.add(newOpt);
            }

            tzInput.value = currentTZ;

            tzInput.onchange = (e) => {
                if (localCalendarData) {
                    localCalendarData.TimeZone = e.target.value;
                }
            };
        }

        renderWeeklyEditor();
        renderExceptionEditor();

        editorModal.classList.add('slds-fade-in-open');
        editorBackdrop.classList.add('slds-backdrop_open');
        if (editorGuard) setTimeout(() => editorGuard.reset(), 0);
    }

    /**
     * PRÉPARATION DES DONNÉES (Transformation) :
     */
    function transformToArrays(data) {
        const processSlots = (slotsObj) => {
            return Object.keys(slotsObj).sort().map(key => {
                const [start, end] = key.split('-');
                return { startT: start.trim(), endT: end.trim(), ...slotsObj[key] };
            });
        };

        const toISODate = (dStr) => {
            if (!dStr) return "";
            const [d, m, y] = dStr.split('/');
            return `${y}-${m}-${d}`;
        };

        // Hebdomadaire
        if (data.Jour) {
            for (const day in data.Jour) {
                data.Jour[day] = processSlots(data.Jour[day]);
            }
        }
        // Exceptions
        if (data.JourExceptionnel) {
            for (const date in data.JourExceptionnel) {
                const exceptionData = data.JourExceptionnel[date];
                // Si c'est un objet contenant Label, on traite ses slots
                if (exceptionData && typeof exceptionData === 'object' && !Array.isArray(exceptionData)) {
                    const label = exceptionData.Label || "";
                    data.JourExceptionnel[date] = processSlots(exceptionData.Slots || {});
                    data.JourExceptionnel[date]._Label = label; // Stockage temporaire du label
                } else {
                    data.JourExceptionnel[date] = processSlots(exceptionData || {});
                }
            }
        }
        return data;
    }

    function closeEditor() {
        editorModal.classList.remove('slds-fade-in-open');
        editorBackdrop.classList.remove('slds-backdrop_open');
        localCalendarData = null;
    }

    if (editBtn) editBtn.addEventListener('click', openEditor);
    if (closeBtn) closeBtn.addEventListener('click', () => {
        if (editorGuard) editorGuard.guardClose(closeEditor); else closeEditor();
    });
    if (cancelBtn) cancelBtn.addEventListener('click', () => {
        if (editorGuard) editorGuard.guardClose(closeEditor); else closeEditor();
    });

    // --- LOGIQUE DE DUPLICATION (Copier un calendrier) ---
    function openDuplicateModal() {
        if (!window.currentCalendarData) return;
        const idInput = document.getElementById('duplicate-id');
        idInput.value = window.currentCalendarData.id_Calendar + '_CLONE';
        if (idInput.closest('.slds-form-element')) {
            idInput.closest('.slds-form-element').classList.remove('slds-has-error');
        }
        document.getElementById('duplicate-name').value = (window.currentCalendarData.Nom || '') + ' (Copie)';

        const tzInput = document.getElementById('duplicate-timezone');
        const currentTZ = window.currentCalendarData.TimeZone || 'Europe/Paris';

        // Ensure option exists
        let optionExists = false;
        for (let i = 0; i < tzInput.options.length; i++) {
            if (tzInput.options[i].value === currentTZ) { optionExists = true; break; }
        }
        if (!optionExists) {
            const newOpt = document.createElement('option');
            newOpt.value = currentTZ;
            newOpt.text = currentTZ;
            tzInput.add(newOpt);
        }
        tzInput.value = currentTZ;

        duplicateModal.classList.add('slds-fade-in-open');
        duplicateBackdrop.classList.add('slds-backdrop_open');
    }

    function closeDuplicateModal() {
        duplicateModal.classList.remove('slds-fade-in-open');
        duplicateBackdrop.classList.remove('slds-backdrop_open');
    }

    async function confirmDuplicate() {
        const newIdInput = document.getElementById('duplicate-id');
        const newId = newIdInput.value.trim();
        const newName = document.getElementById('duplicate-name').value.trim();
        const newTz = document.getElementById('duplicate-timezone').value;

        // Reset error state
        if (newIdInput.closest('.slds-form-element')) {
            newIdInput.closest('.slds-form-element').classList.remove('slds-has-error');
        }

        if (!newId) {
            if (newIdInput.closest('.slds-form-element')) {
                newIdInput.closest('.slds-form-element').classList.add('slds-has-error');
            }
            showToast("L'ID du calendrier est obligatoire.", "error");
            return;
        }

        // Contrôle de l'ID : seulement alphanumérique et underscore
        if (!/^[a-zA-Z0-9_]+$/.test(newId)) {
            if (newIdInput.closest('.slds-form-element')) {
                newIdInput.closest('.slds-form-element').classList.add('slds-has-error');
            }
            showToast("L'ID ne doit contenir que des lettres, chiffres et le caractère '_'. (Espaces et caractères spéciaux interdits)", "error");
            return;
        }

        // Check if ID already exists in loaded list
        const select = document.getElementById('calendar-select');
        if (select) {
            for (let i = 0; i < select.options.length; i++) {
                if (select.options[i].value === newId) {
                    if (newIdInput.closest('.slds-form-element')) {
                        newIdInput.closest('.slds-form-element').classList.add('slds-has-error');
                    }
                    showToast("Cet ID de calendrier existe déjà.", "error");
                    return;
                }
            }
        }

        // Copie des données
        const newData = JSON.parse(JSON.stringify(window.currentCalendarData));
        newData.id_Calendar = enforcePrefix(newId);
        newData.Nom = newName;
        newData.TimeZone = newTz;

        confirmDuplicateBtn.disabled = true;
        confirmDuplicateBtn.textContent = 'Création...';

        try {
            await window.dynamoDBService.put(getTargetTable(), newData);
            showToast("Calendrier dupliqué avec succès !", "success");
            closeDuplicateModal();
            // Refresh list (supposant que populateCalendarSelect est global ou accessible via event)
            if (typeof window.populateCalendarSelect === 'function') {
                await window.populateCalendarSelect();
                // Select the new calendar
                const selectElement = document.getElementById('calendar-select');
                selectElement.value = newId;
                selectElement.dispatchEvent(new Event('change'));
            }
        } catch (err) {
            // handled by service
        } finally {
            confirmDuplicateBtn.disabled = false;
            confirmDuplicateBtn.textContent = 'Dupliquer';
        }
    }

    if (duplicateBtn) duplicateBtn.addEventListener('click', openDuplicateModal);
    if (closeDuplicateBtn) closeDuplicateBtn.addEventListener('click', closeDuplicateModal);
    if (cancelDuplicateBtn) cancelDuplicateBtn.addEventListener('click', closeDuplicateModal);
    if (confirmDuplicateBtn) confirmDuplicateBtn.addEventListener('click', confirmDuplicate);

    // --- LOGIQUE DE SUPPRESSION ---
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
            if (!window.currentCalendarData) return;
            const calendarId = window.currentCalendarData.id_Calendar;
            const calendarName = window.currentCalendarData.Nom || calendarId;

            showConfirmModal(
                "Suppression du calendrier",
                `Êtes - vous sûr de vouloir supprimer définitivement le calendrier "<strong>${calendarName}</strong>"(${calendarId}) ?\nCette action est irréversible.`,
                async () => {
                    deleteBtn.disabled = true;
                    deleteBtn.textContent = '...';

                    try {
                        await window.dynamoDBService.delete(getTargetTable(), { 'id_Calendar': calendarId });
                        showToast("Calendrier supprimé avec succès.", "success");

                        // Clear current selection
                        window.currentCalendarData = null;
                        document.getElementById('edit-calendar-container').classList.add('slds-hide');
                        document.getElementById('annual-calendar-container').classList.add('slds-hide');

                        // Refresh list
                        if (typeof window.populateCalendarSelect === 'function') {
                            await window.populateCalendarSelect();
                            // Reset dropdown
                            document.getElementById('calendar-select').value = "";
                        }
                    } catch (err) {
                        // handled by service
                    } finally {
                        deleteBtn.disabled = false;
                        deleteBtn.innerHTML = '<span class="slds-m-right_xx-small">🗑️</span> Supprimer';
                    }
                }
            );
        });
    }

    // --- LOGIQUE DE CRÉATION (Nouveau calendrier vide) ---
    function openCreateModal() {
        // Reset form
        const idInput = document.getElementById('create-id');
        idInput.value = '';
        if (idInput.closest('.slds-form-element')) {
            idInput.closest('.slds-form-element').classList.remove('slds-has-error');
        }
        document.getElementById('create-name').value = '';
        document.getElementById('create-timezone').value = 'Europe/Paris';

        if (createModal && createBackdrop) {
            createModal.classList.add('slds-fade-in-open');
            createBackdrop.classList.add('slds-backdrop_open');
        }
    }

    function closeCreateModal() {
        if (createModal && createBackdrop) {
            createModal.classList.remove('slds-fade-in-open');
            createBackdrop.classList.remove('slds-backdrop_open');
        }
    }
    function confirmCreate() {
        const newIdInput = document.getElementById('create-id');
        const newId = newIdInput.value.trim();
        const newNameInput = document.getElementById('create-name');
        const newName = newNameInput.value.trim();
        const newTzInput = document.getElementById('create-timezone');
        const newTz = newTzInput.value;

        // Reset error state
        if (newIdInput.closest('.slds-form-element')) {
            newIdInput.closest('.slds-form-element').classList.remove('slds-has-error');
        }

        if (!newId) {
            if (newIdInput.closest('.slds-form-element')) {
                newIdInput.closest('.slds-form-element').classList.add('slds-has-error');
            }
            showToast("L'ID du calendrier est obligatoire.", "error");
            return;
        }

        // Contrôle de l'ID : seulement alphanumérique et underscore
        if (!/^[a-zA-Z0-9_]+$/.test(newId)) {
            if (newIdInput.closest('.slds-form-element')) {
                newIdInput.closest('.slds-form-element').classList.add('slds-has-error');
            }
            showToast("L'ID ne doit contenir que des lettres, chiffres et le caractère '_'. (Espaces et caractères spéciaux interdits)", "error");
            return;
        }

        // Check if ID already exists in loaded list
        const select = document.getElementById('calendar-select');
        if (select) {
            for (let i = 0; i < select.options.length; i++) {
                if (select.options[i].value === newId) {
                    if (newIdInput.closest('.slds-form-element')) {
                        newIdInput.closest('.slds-form-element').classList.add('slds-has-error');
                    }
                    showToast("Cet ID de calendrier existe déjà.", "error");
                    return;
                }
            }
        }

        // Initialize new calendar object (DynamoDB structure)
        const newCalendar = {
            id_Calendar: enforcePrefix(newId),
            Nom: newName,
            TimeZone: newTz,
            Jour: {
                "Lundi": {}, "Mardi": {}, "Mercredi": {}, "Jeudi": {}, "Vendredi": {}, "Samedi": {}, "Dimanche": {}
            },
            JourExceptionnel: {}
        };

        window.currentCalendarData = newCalendar;

        closeCreateModal();
        openEditor();
        showToast("Initialisation... Configurez et sauvegardez pour créer définitivement.", "info");
    }

    if (createBtn) createBtn.addEventListener('click', openCreateModal);
    if (closeCreateBtn) closeCreateBtn.addEventListener('click', closeCreateModal);
    if (cancelCreateBtn) cancelCreateBtn.addEventListener('click', closeCreateModal);
    if (confirmCreateBtn) confirmCreateBtn.addEventListener('click', confirmCreate);

    // --- REAL-TIME VALIDATION ---
    ['create-id', 'duplicate-id'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', () => {
                const formEl = input.closest('.slds-form-element');
                const val = input.value;
                const isValid = /^[a-zA-Z0-9_]*$/.test(val); // Allow empty during typing, check at submit. But check chars.

                if (!isValid) {
                    if (formEl) formEl.classList.add('slds-has-error');
                    if (formEl && !formEl.querySelector('.slds-form-element__help')) {
                        const msg = document.createElement('div');
                        msg.className = 'slds-form-element__help';
                        msg.textContent = "Caractères non autorisés (uniquement lettres, chiffres, _).";
                        formEl.appendChild(msg);
                    }
                } else {
                    if (formEl) {
                        formEl.classList.remove('slds-has-error');
                        const msg = formEl.querySelector('.slds-form-element__help');
                        if (msg) msg.remove();
                    }
                }
            });
        }
    });

    // --- AFFICHAGE DE L'ONGLET : SEMAINE TYPE ---
    function renderWeeklyEditor() {
        const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
        let html = '<div class="slds-grid slds-wrap slds-gutters">';

        days.forEach(day => {
            html += `
            <div class="slds-col slds-size_1-of-1 slds-m-bottom_medium">
                <article class="slds-card slds-card_boundary">
                    <div class="slds-card__header slds-grid">
                        <header class="slds-media slds-media_center slds-has-flexi-truncate">
                            <div class="slds-media__body">
                                <h2 class="slds-card__header-title">
                                    <span class="slds-text-heading_small">${day}</span>
                                </h2>
                            </div>
                        </header>
                        <div class="slds-no-flex">
                            ${day !== 'Dimanche' ? `<button class="slds-button slds-button_neutral" onclick="copyToNextDay('${day}')" title="Copier vers le jour suivant">⬇️</button>` : ''}
                            <button class="slds-button slds-button_neutral" onclick="addSlot('weekly', '${day}')">➕ Créneau</button>
                        </div>
                    </div>
                    <div class="slds-card__body slds-card__body_inner">
                        <div id="slots-weekly-${day}">
                            ${renderSlots(localCalendarData.Jour[day] || [], 'weekly', day)}
                        </div>
                    </div>
                </article>
            </div>
            `;
        });
        html += '</div>';
        weeklyEditorContent.innerHTML = html;
    }

    window.copyToNextDay = function (currentDay) {
        const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
        const currentIndex = days.indexOf(currentDay);
        if (currentIndex === -1) return;

        const nextIndex = (currentIndex + 1) % days.length;
        const nextDay = days[nextIndex];

        showConfirmModal(
            "Copie de la configuration",
            `Voulez-vous copier la configuration de <strong>${currentDay}</strong> vers <strong>${nextDay}</strong> ?\nCela écrasera les créneaux existants de ${nextDay}.`,
            () => {
                // Deep copy des slots
                const sourceSlots = localCalendarData.Jour[currentDay] || [];
                localCalendarData.Jour[nextDay] = JSON.parse(JSON.stringify(sourceSlots));
                refreshEditor();
                showToast(`Configuration copiée vers ${nextDay}`, "success");
            }
        );
    };


    // --- AFFICHAGE DE L'ONGLET : EXCEPTIONS ---
    function renderExceptionEditor() {
        let html = `
            <div class="slds-box slds-m-bottom_medium" style="background-color: #c5c5c5;">
                <div class="slds-grid slds-gutters slds-grid_vertical-align-center">
                    <div class="slds-col slds-size_1-of-3">
                        <label for="new-exception-date" class="slds-form-element__label">Date</label>
                        <input type="date" id="new-exception-date" class="slds-input">
                    </div>
                    <div class="slds-col slds-size_2-of-3">
                        <label for="new-exception-label" class="slds-form-element__label">Nom (ex: Noël, Maintenance)</label>
                        <input type="text" id="new-exception-label" class="slds-input" placeholder="Optionnel">
                    </div>
                </div>
                <div class="slds-grid slds-gutters slds-grid_vertical-align-center slds-m-top_x-small">
                     <div class="slds-col">
                        <label for="new-exception-start" class="slds-form-element__label">Début</label>
                        <input type="time" id="new-exception-start" class="slds-input" lang="fr-FR">
                    </div>
                    <div class="slds-col">
                        <label for="new-exception-end" class="slds-form-element__label">Fin</label>
                        <input type="time" id="new-exception-end" class="slds-input" lang="fr-FR">
                    </div>
                    <div class="slds-col">
                        <label for="new-exception-status" class="slds-form-element__label">Statut</label>
                         <select id="new-exception-status" class="slds-select">
                            ${renderStatusOptions('Ouvert')}
                        </select>
                    </div>
                    ${!shouldHideActions() ? `
                        <div class="slds-col">
                            <label for="new-exception-type" class="slds-form-element__label">Type</label>
                            <select id="new-exception-type" class="slds-select" onchange="const val = this.value; const sel = document.getElementById('new-exception-action'); const lbl = document.getElementById('new-exception-action-label'); if (sel) { sel.innerHTML = (val === 'Parcours') ? window.renderParcoursOptions('') : window.renderActionOptions(''); } if (lbl) { lbl.textContent = (val === 'Parcours') ? 'Parcours' : 'Action'; }">
                                ${renderTypeOptions('Action')}
                            </select>
                        </div>
                        <div class="slds-col">
                            <label for="new-exception-action" id="new-exception-action-label" class="slds-form-element__label">${getActionLabel()}</label>
                            <select id="new-exception-action" class="slds-select">
                                ${renderActionOptions('')}
                            </select>
                        </div>
                    ` : ''}
                    <div class="slds-col slds-no-flex slds-align-bottom">
                        <button class="slds-button slds-button_brand" id="btn-add-exception-slot">Ajouter</button>
                    </div>
                </div>
            </div>
        `;

        if (localCalendarData.JourExceptionnel && Object.keys(localCalendarData.JourExceptionnel).length > 0) {
            const sortedDates = Object.keys(localCalendarData.JourExceptionnel).sort((a, b) => {
                const [d1, m1, y1] = a.split('/').map(Number);
                const [d2, m2, y2] = b.split('/').map(Number);
                return new Date(y1, m1 - 1, d1) - new Date(y2, m2 - 1, d2);
            });

            sortedDates.forEach(date => {
                html += `
                    <article class="slds-card slds-card_boundary slds-m-bottom_medium">
                        <div class="slds-card__header slds-grid">
                            <header class="slds-media slds-media_center slds-has-flexi-truncate">
                                <div class="slds-media__body">
                                    <h2 class="slds-card__header-title">
                                        <span>💎 Exception : ${date}${localCalendarData.JourExceptionnel[date]._Label ? ' (' + localCalendarData.JourExceptionnel[date]._Label + ')' : ''}</span>
                                    </h2>
                                </div>
                            </header>
                            <div class="slds-no-flex">
                                <button class="slds-button slds-button_neutral" onclick="openEditExceptionModal('${date}')" title="Modifier la date ou le nom">✏️ Modifier</button>
                                <button class="slds-button slds-button_neutral slds-m-left_x-small" onclick="addSlot('exception', '${date}')">➕ Créneau</button>
                                <button class="slds-button slds-button_destructive slds-m-left_x-small" onclick="deleteRange('JourExceptionnel', '${date}')">🗑️ Supprimer</button>
                            </div>
                        </div>
                        <div class="slds-card__body slds-card__body_inner">
                            <div id="slots-exception-${date}">
                                ${renderSlots(localCalendarData.JourExceptionnel[date] || [], 'exception', date)}
                            </div>
                        </div>
                    </article>
                `;
            });
        } else {
            html += '<p class="slds-text-align_center slds-p-around_large">Aucun jour exceptionnel défini.</p>';
        }
        exceptionEditorContent.innerHTML = html;

        // Attacher l'événement au bouton "Ajouter"
        const btnAdd = document.getElementById('btn-add-exception-slot');
        if (btnAdd) {
            btnAdd.removeEventListener('click', onAddExceptionSlot);
            btnAdd.addEventListener('click', onAddExceptionSlot);
        }
    }

    function onAddExceptionSlot() {
        const dateInput = document.getElementById('new-exception-date');
        const startInput = document.getElementById('new-exception-start');
        const endInput = document.getElementById('new-exception-end');
        const statusInput = document.getElementById('new-exception-status');
        const actionInput = document.getElementById('new-exception-action');
        const typeInput = document.getElementById('new-exception-type');
        const labelInput = document.getElementById('new-exception-label');

        if (!dateInput.value) { showToast("Veuillez sélectionner une date.", "error"); return; }
        if (!startInput.value || !endInput.value) { showToast("Veuillez saisir les horaires.", "error"); return; }

        const [y, m, d] = dateInput.value.split('-');
        const dateFr = `${d} /${m}/${y} `;
        const label = labelInput ? labelInput.value.trim() : "";

        // Créer l'entrée si elle n'existe pas
        if (!localCalendarData.JourExceptionnel[dateFr]) {
            localCalendarData.JourExceptionnel[dateFr] = [];
        }

        // Stockage du libellé sur le tableau de la date
        localCalendarData.JourExceptionnel[dateFr]._Label = label;

        localCalendarData.JourExceptionnel[dateFr].push({
            startT: startInput.value,
            endT: endInput.value,
            Status: statusInput.value,
            Action: actionInput ? actionInput.value : null,
            Type: typeInput ? (typeInput.value || 'Action') : (document.body.getAttribute('data-module') === 'distribution' ? 'Action' : undefined)
        });

        refreshEditor();
    }

    // --- DESSIN GÉNÉRIQUE DES CRÉNEAUX HORAIRES ---
    window.renderSlots = function (slotsArray, type, key1, key2 = null) {
        let html = '';
        if (slotsArray.length === 0) return '<div class="slds-text-color_weak slds-text-body_small">Aucun créneau défini</div>';

        slotsArray.forEach((slot, index) => {
            const safeKey1 = String(key1).replace(/[^a-zA-Z0-9]/g, '_');
            const safeKey2 = key2 ? String(key2).replace(/[^a-zA-Z0-9]/g, '_') : 'na';
            const baseId = `slot-${type}-${safeKey1}-${safeKey2}-${index}`;

            html += `
                <div class="slds-grid slds-grid_vertical-align-center slds-m-bottom_xx-small slot-row">
                    <!-- Heure Début -->
                    <div class="slds-col slds-size_2-of-12">
                        <label for="${baseId}-start" class="slds-form-element__label">Heure de début</label>
                        <div class="slds-form-element">
                             <div class="slds-form-element__control">
                                <input type="time" id="${baseId}-start" name="${baseId}-start" class="slds-input text-align_center" value="${slot.startT || ''}" onchange="updateSlotTime('${type}', '${key1}', '${key2}', ${index}, 'startT', this.value)" lang="fr-FR">
                            </div>
                        </div>
                    </div>

                    <div class="slds-col slds-grow-none slds-p-horizontal_small">-</div>

                    <!-- Heure Fin -->
                    <div class="slds-col slds-size_2-of-12">
                         <label for="${baseId}-end" class="slds-form-element__label">Heure de fin</label>
                         <div class="slds-form-element">
                             <div class="slds-form-element__control">
                                <input type="time" id="${baseId}-end" name="${baseId}-end" class="slds-input text-align_center" value="${slot.endT || ''}" onchange="updateSlotTime('${type}', '${key1}', '${key2}', ${index}, 'endT', this.value)" lang="fr-FR">
                             </div>
                        </div>
                    </div>

                    <div class="slds-col ${shouldHideActions() ? 'slds-size_6-of-12' : 'slds-size_2-of-12'} slds-m-left_small">
                        <label for="${baseId}-status" class="slds-form-element__label">Statut</label>
                        <div class="slds-select_container">
                            <select id="${baseId}-status" name="${baseId}-status" class="slds-select" onchange="updateSlotValue('${type}', '${key1}', '${key2}', ${index}, 'Status', this.value)">
                                ${renderStatusOptions(slot.Status)}
                            </select>
                        </div>
                    </div>
                    ${!shouldHideActions() ? `
                        ${document.body.getAttribute('data-module') === 'distribution' ? `
                        <div class="slds-col slds-size_2-of-12 slds-m-left_x-small">
                            <label for="${baseId}-type" class="slds-form-element__label">Type</label>
                            <div class="slds-select_container">
                                <select id="${baseId}-type" name="${baseId}-type" class="slds-select" onchange="updateSlotValue('${type}', '${key1}', '${key2}', ${index}, 'Type', this.value)">
                                    ${renderTypeOptions(slot.Type || 'Action')}
                                </select>
                            </div>
                        </div>
                        ` : ''}
                        <div class="slds-col slds-size_2-of-12 slds-m-left_x-small">
                            <label for="${baseId}-action" class="slds-form-element__label">${(document.body.getAttribute('data-module') === 'distribution' && slot.Type === 'Parcours') ? 'Parcours' : (document.body.getAttribute('data-module') === 'distribution' ? 'Action' : getActionLabel())}</label>
                            <div class="slds-select_container">
                                <select id="${baseId}-action" name="${baseId}-action" class="slds-select" onchange="updateSlotValue('${type}', '${key1}', '${key2}', ${index}, 'Action', this.value)">
                                    ${(document.body.getAttribute('data-module') === 'distribution' && slot.Type === 'Parcours') ? renderParcoursOptions(slot.Action || '') : renderActionOptions(slot.Action || '')}
                                </select>
                            </div>
                        </div>
                    ` : ''}
                    <div class="slds-col slds-grow-none slds-m-left_x-small">
                        <button class="slds-button slds-button_icon slds-button_icon-error" onclick="removeSlot('${type}', '${key1}', '${key2}', ${index})" title="Supprimer le créneau">🗑️</button>
                    </div>
                </div>
            `;
        });
        return html;
    };

    // --- ACTIONS SUR LES CRÉNEAUX ---

    window.addSlot = function (type, key1, key2 = null) {
        let targetList;
        if (type === 'weekly') targetList = localCalendarData.Jour[key1];
        if (type === 'exception') targetList = localCalendarData.JourExceptionnel[key1];

        // On ajoute un objet vide à la fin avec Type par défaut si en mode distribution
        const newSlot = { 
            startT: "", 
            endT: "", 
            Status: "Ouvert", 
            Action: shouldHideActions() ? null : "Appelant" 
        };
        
        if (document.body.getAttribute('data-module') === 'distribution') {
            newSlot.Type = 'Action';
        }

        targetList.push(newSlot);
        refreshEditor();
    };

    window.removeSlot = function (type, key1, key2, index) {
        let targetList;
        if (type === 'weekly') targetList = localCalendarData.Jour[key1];
        if (type === 'exception') targetList = localCalendarData.JourExceptionnel[key1];

        targetList.splice(index, 1);
        refreshEditor();
    };

    window.updateSlotValue = function (type, key1, key2, index, field, value) {
        let targetList;
        if (type === 'weekly') targetList = localCalendarData.Jour[key1];
        if (type === 'exception') targetList = localCalendarData.JourExceptionnel[key1];

        if (field === 'Action' && value.trim() === '') value = null;
        targetList[index][field] = value;

        // Si on change le TYPE dans le module distribution, on doit rafraîchir l'UI pour mettre à jour la liste des actions
        if (field === 'Type' && document.body.getAttribute('data-module') === 'distribution') {
            targetList[index].Action = ""; // Reset de l'action pour forcer un nouveau choix
            refreshEditor();
        }
    };

    window.updateSlotTime = function (type, key1, key2, index, field, newValue) {
        let targetList;
        if (type === 'weekly') targetList = localCalendarData.Jour[key1];
        if (type === 'exception') targetList = localCalendarData.JourExceptionnel[key1];

        targetList[index][field] = newValue;

        // Simple Time Validation
        const slot = targetList[index];
        const safeKey1 = String(key1).replace(/[^a-zA-Z0-9]/g, '_');
        const safeKey2 = key2 ? String(key2).replace(/[^a-zA-Z0-9]/g, '_') : 'na';
        const baseId = `slot - ${type} -${safeKey1} -${safeKey2} -${index} `;

        const startInput = document.getElementById(`${baseId} -start`);
        const endInput = document.getElementById(`${baseId} -end`);

        if (slot.startT && slot.endT) {
            const [sh, sm] = slot.startT.split(':').map(Number);
            const [eh, em] = slot.endT.split(':').map(Number);

            if (eh < sh || (eh === sh && em <= sm)) {
                if (endInput) {
                    const formEl = endInput.closest('.slds-form-element');
                    if (formEl) formEl.classList.add('slds-has-error');
                }
                if (startInput) {
                    const formEl = startInput.closest('.slds-form-element');
                    if (formEl) formEl.classList.add('slds-has-error');
                }
            } else {
                if (endInput) {
                    const formEl = endInput.closest('.slds-form-element');
                    if (formEl) formEl.classList.remove('slds-has-error');
                }
                if (startInput) {
                    const formEl = startInput.closest('.slds-form-element');
                    if (formEl) formEl.classList.remove('slds-has-error');
                }
            }
        }
    };

    window.deleteRange = function (category, key) {
        showConfirmModal(
            "Confirmation de suppression",
            `Êtes - vous sûr de vouloir supprimer l'exception <strong>${key}</strong> ?`,
            () => {
                delete localCalendarData[category][key];
                refreshEditor();
                showToast("Exception supprimée.", "success");
            }
        );
    };

    // --- AJOUT DE NOUVELLES EXCEPTIONS ---

    if (addExceptionBtn) {
        addExceptionBtn.addEventListener('click', () => {
            document.getElementById('new-exception-date').focus();
            showToast("Utilisez le formulaire ci-dessus pour ajouter un nouveau jour exceptionnel.", "info");
        });
    }

    function refreshEditor() {
        renderWeeklyEditor();
        renderExceptionEditor();
    }

    // --- SAUVEGARDE ET VALIDATION ---

    saveBtn.addEventListener('click', async () => {
        // 1. Validation et Conversion en format DynamoDB (Map d'objets)
        let finalData;
        try {
            finalData = prepareDataForSaving(localCalendarData);
        } catch (e) {
            showToast(e.message, "error", 5000);
            return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = 'Sauvegarde...';

        try {
            await window.dynamoDBService.put(getTargetTable(), finalData);
            showToast("Calendrier sauvegardé avec succès !", "success");
            if (editorGuard) editorGuard.reset();
            window.currentCalendarData = finalData;

            // Refresh list and keep selection
            if (typeof window.populateCalendarSelect === 'function') {
                await window.populateCalendarSelect();
                const selectElement = document.getElementById('calendar-select');
                if (selectElement) {
                    selectElement.value = finalData.id_Calendar;
                }
            }

            if (typeof renderAnnualCalendar === 'function') renderAnnualCalendar(window.calendarDisplayYear);
            closeEditor();
        } catch (err) {
            // handled by service
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Sauvegarder';
        }
    });

    /**
     * PRÉPARATION POUR LA SAUVEGARDE :
     */
    function prepareDataForSaving(data) {
        const result = JSON.parse(JSON.stringify(data));

        const fromISODate = (isoStr) => {
            if (!isoStr) return "";
            const [y, m, d] = isoStr.split('-');
            return `${d}/${m}/${y}`;
        };

        const convertList = (list, context) => {
            const map = {};
            const slots = [];

            list.forEach((slot, idx) => {
                if (!slot.startT || !slot.endT) {
                    throw new Error(`Erreur dans ${context} : Le créneau n°${idx + 1} est incomplet.`);
                }

                // Parsing des heures
                const [startH, startM] = slot.startT.split(':').map(Number);
                let [endH, endM] = slot.endT.split(':').map(Number);

                // Normalisation
                if (endH === 0 && endM === 0) {
                    endH = 23;
                    endM = 59;
                } else if (endH === 24) {
                    endH = 23;
                    endM = 59;
                }

                const startTotal = startH * 60 + startM;
                const endTotal = endH * 60 + endM;

                if (endTotal <= startTotal) {
                    throw new Error(`Erreur dans ${context} : L'heure de fin (${slot.endT}) doit être après l'heure de début(${slot.startT}).`);
                }

                // Reconstruction de la clé
                const sHStr = String(startH).padStart(2, '0');
                const sMStr = String(startM).padStart(2, '0');
                const eHStr = String(endH).padStart(2, '0');
                const eMStr = String(endM).padStart(2, '0');

                const finalKey = `${sHStr}:${sMStr}-${eHStr}:${eMStr}`;

                const slotData = { Status: slot.Status, Action: slot.Action };
                if (document.body.getAttribute('data-module') === 'distribution') {
                    slotData.Type = slot.Type || 'Action';
                } else if (slot.Type) {
                    slotData.Type = slot.Type;
                }

                map[finalKey] = slotData;
                slots.push({ start: startTotal, end: endTotal, key: finalKey });
            });

            // Vérifier chevauchements de créneaux
            slots.sort((a, b) => a.start - b.start);
            for (let i = 0; i < slots.length - 1; i++) {
                if (slots[i].end > slots[i + 1].start) {
                    throw new Error(`Erreur dans ${context} : Les créneaux ${slots[i].key} et ${slots[i + 1].key} se chevauchent.`);
                }
            }
            return map;
        };

        // Hebdomadaire
        for (const day in result.Jour) {
            result.Jour[day] = convertList(result.Jour[day], `Semaine Type - ${day} `);
        }

        // Exceptions
        for (const date in result.JourExceptionnel) {
            // Note: On accède à data (source originale) car JSON.stringify sur result a supprimé la propriété _Label du tableau
            const label = (data.JourExceptionnel[date] && data.JourExceptionnel[date]._Label) ? data.JourExceptionnel[date]._Label : "";
            const slots = convertList(result.JourExceptionnel[date], `Exception - ${date} `);

            // On enregistre sous forme d'objet structuré si on a un label, pour ne pas casser la structure DynamoDB attendue
            result.JourExceptionnel[date] = {
                Label: label,
                Slots: slots
            };
        }

        return result;
    }

    // --- GÉNÉRATION DES MENUS DÉROULANTS (Statuts et Actions) ---

    function renderStatusOptions(selectedValue) {
        const options = [
            { value: "Ouvert", label: "⬜ Ouvert" },
            { value: "OuvertSansAttente", label: "🔲 Ouvert Sans Attente" },
            { value: "PreFermeture", label: "🔳 Pré-fermeture" },
            { value: "Ferme", label: "⬛ Fermé" },
            { value: "FermetureExeptionelle", label: "🟫 Fermeture exceptionnelle" },
            { value: "FermetureHebdomadaire", label: "🟧 Fermeture hebdomadaire" },
            { value: "FermetureJourFerie", label: "🟥 Fermeture jour férié" }
        ];

        let html = '<optgroup label="Sélectionnez un statut">';
        options.forEach(opt => {
            const isSelected = (opt.value === selectedValue) ? 'selected' : '';
            html += `<option value="${opt.value}" ${isSelected}>${opt.label}</option>`;
        });
        html += '</optgroup>';
        return html;
    }

    function renderActionOptions(selectedAction) {
        let html = '<option value="">-- Sélectionner une Action --</option>';

        // Si on est en mode distribution, on utilise les actions de la table Core_Ddb_EnchainementParametrageActions
        if (document.body.getAttribute('data-module') === 'distribution' && allActions.length > 0) {
            allActions.forEach(a => {
                const val = a.Action;
                const isSelected = (val === selectedAction) ? 'selected' : '';
                html += `<option value="${val}" ${isSelected}>${val}</option>`;
            });
        } else {
            // Liste par défaut pour les autres modules
            const actions = [
                { value: "Appelant", label: "Appelant" },
                { value: "AppelantIdentifie", label: "Appelant Identifié" },
                { value: "CalendrierAccueil", label: "Calendrier Accueil" },
                { value: "CalendrierDistribution", label: "Calendrier Distribution" },
                { value: "DepartementAppelant", label: "Departement Appelant" },
                { value: "Domaine", label: "Domaine" },
                { value: "EtatDistribution", label: "Etat Distribution" },
                { value: "FluxOuvert", label: "Flux Ouvert" },
                { value: "GroupementSegment", label: "Groupement Segment" },
                { value: "InstructionModule", label: "Instruction Module" },
                { value: "IntentionDeduite", label: "Intention Déduite" },
                { value: "IntentionExprimee", label: "Intention Exprimée" },
                { value: "Marque", label: "Marque" },
                { value: "Messages", label: "Messages" },
                { value: "Module", label: "Module" },
                { value: "MotifAction", label: "Motif Action" },
                { value: "NomBot", label: "Nom Bot" },
                { value: "NomSVI", label: "Nom SVI" },
                { value: "NumeroExterne", label: "Numéro Externe" },
                { value: "NumeroTelAppelant", label: "Numéro Tél Appelant" },
                { value: "NumeroTelAppele", label: "Numéro Tél Appelé" },
                { value: "ParcoursDistribution", label: "Parcours Distribution" },
                { value: "Segment", label: "Segment" },
                { value: "Signification", label: "Signification" },
                { value: "SituationsExceptionnelles", label: "Situations Exceptionnelles" },
                { value: "SousDomaine", label: "Sous-Domaine" },
                { value: "StatutOuvertureFermeture", label: "Statut Ouverture/Fermeture" },
                { value: "TempsAttenteMaxEstimé", label: "Temps Attente Max Estimé" }
            ];

            actions.forEach(action => {
                const isSelected = selectedAction === action.value ? 'selected' : '';
                html += `<option value="${action.value}" ${isSelected}>${action.label}</option>`;
            });
        }
        return html;
    }

    function renderTypeOptions(selectedValue) {
        const types = [
            { value: "Action", label: "Action" },
            { value: "Parcours", label: "Parcours" }
        ];
        let html = '';
        types.forEach(t => {
            const isSelected = (t.value === selectedValue) ? 'selected' : '';
            html += `<option value="${t.value}" ${isSelected}>${t.label}</option>`;
        });
        return html;
    }

    function renderParcoursOptions(selectedValue) {
        let html = '<option value="">-- Sélectionner un Parcours --</option>';
        allParcours.forEach(p => {
            const val = p.Parcours;
            const isSelected = (val === selectedValue) ? 'selected' : '';
            html += `<option value="${val}" ${isSelected}>${val}</option>`;
        });
        return html;
    }

    window.renderStatusOptions = renderStatusOptions;
    window.renderActionOptions = renderActionOptions;
    window.renderTypeOptions = renderTypeOptions;
    window.renderParcoursOptions = renderParcoursOptions;

});
