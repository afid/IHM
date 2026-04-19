/**
 * activation-manager.js
 *
 * GESTIONNAIRE D'ACTIVATION DES SITUATIONS :
 * Permet d'affecter des situations prédéfinies aux structures (Marques, Domaines, etc.)
 */

document.addEventListener('DOMContentLoaded', () => {
    const STRUCTURES_TABLE = 'Core_Ddb_ParametrageCentralise';
    const SITUATIONS_TABLE = 'Core_Ddb_IHM';

    // DOM Selection elements
    const marqueSelect = document.getElementById('marque-select');
    const domaineFilterContainer = document.getElementById('domaine-filter-container');
    const domaineSelect = document.getElementById('domaine-select');
    const sousDomaineFilterContainer = document.getElementById('sous-domaine-filter-container');
    const sousDomaineSelect = document.getElementById('sous-domaine-select');

    const structureDetailsContainer = document.getElementById('structure-details-container');
    const detailStructureName = document.getElementById('detail-structure-name');
    const structureDetailsContent = document.getElementById('structure-details-content');

    // Modal elements
    const activationModal = document.getElementById('activation-modal');
    const modalBackdrop = document.getElementById('modal-backdrop');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const cancelModalBtn = document.getElementById('cancel-modal-btn');
    const saveActivationBtn = document.getElementById('save-activation-btn');
    const situationSelect = document.getElementById('situation-select');
    const addSituationBtn = document.getElementById('add-situation-to-struct-btn');
    const recapContainer = document.getElementById('situation-recap-container');
    const recapName = document.getElementById('recap-name');
    const recapContent = document.getElementById('recap-content');
    const activeSituationsList = document.getElementById('active-situations-list');
    const editorStructureName = document.getElementById('editor-structure-name');
    const editorEtatToggle = document.getElementById('editor-etat-toggle');

    // Periods Modal elements (New)
    const periodsModal = document.getElementById('periods-editor-modal');
    const periodsModalBackdrop = document.getElementById('periods-modal-backdrop');
    const periodsModalSitName = document.getElementById('periods-modal-sit-name');
    const editPeriodStartDate = document.getElementById('edit-period-start-date');
    const editPeriodStartTime = document.getElementById('edit-period-start-time');
    const editPeriodEndDate = document.getElementById('edit-period-end-date');
    const editPeriodEndTime = document.getElementById('edit-period-end-time');
    const savePeriodsBtn = document.getElementById('save-periods-btn');
    const clearPeriodsBtn = document.getElementById('clear-periods-btn');
    const closePeriodsModalBtn = document.getElementById('close-periods-modal-btn');
    const cancelPeriodsModalBtn = document.getElementById('cancel-periods-modal-btn');

    // State
    let allStructures = [];
    let allSituations = [];
    let currentStructure = null;
    let selectedSituationToRecord = null;
    let tempActiveSituations = {}; // { Nom: {DateDebut, HeureDebut, DateFin, HeureFin, Preponderance} }
    let currentEditingSitName = null; // Nom de la situation en cours d'édition de période

    /**
     * Initialisation
     */
    async function init() {
        await Promise.all([
            loadStructures(),
            loadSituations()
        ]);
        setupEventListeners();
    }

    /**
     * Charge les structures
     */
    async function loadStructures() {
        try {
            marqueSelect.innerHTML = '<option value="">Chargement...</option>';
            allStructures = await window.dynamoDBService.scan(STRUCTURES_TABLE);
            allStructures.sort((a, b) => (a.Structure || '').localeCompare(b.Structure || ''));
            populateMarques();
        } catch (err) {
            marqueSelect.innerHTML = '<option value="">Erreur chargement</option>';
        }
    }

    /**
     * Charge les situations prédéfinies
     */
    async function loadSituations() {
        try {
            const items = await window.dynamoDBService.scan(SITUATIONS_TABLE);
            allSituations = (items || []).filter(item => item.Type === 'Situation');
            populateSituationsSelect();
        } catch (err) {
            console.error('Erreur situations:', err);
        }
    }

    function populateMarques() {
        marqueSelect.innerHTML = '<option value="">Sélectionner une marque...</option>';
        allStructures
            .filter(s => (s.Type || '').toLowerCase() === 'marque' && (s.Structure || '').toLowerCase() !== 'default')
            .forEach(item => {
                const opt = new Option(item.Structure, item.Structure);
                marqueSelect.add(opt);
            });
    }

    function populateDomaines(parentMarque) {
        domaineSelect.innerHTML = '<option value="">Sélectionner un domaine...</option>';
        const domaines = allStructures.filter(s => s.Type === 'domaine' && s.Parent === parentMarque);

        if (domaines.length > 0) {
            domaines.forEach(item => domaineSelect.add(new Option(item.Structure, item.Structure)));
            domaineFilterContainer.classList.remove('slds-hide');
        } else {
            domaineFilterContainer.classList.add('slds-hide');
        }
        sousDomaineFilterContainer.classList.add('slds-hide');
    }

    function populateSousDomaines(parentDomaine) {
        sousDomaineSelect.innerHTML = '<option value="">Sélectionner un sous-domaine...</option>';
        const sousDomaines = allStructures.filter(s => s.Type === 'sous-domaine' && s.Parent === parentDomaine);

        if (sousDomaines.length > 0) {
            sousDomaines.forEach(item => sousDomaineSelect.add(new Option(item.Structure, item.Structure)));
            sousDomaineFilterContainer.classList.remove('slds-hide');
        } else {
            sousDomaineFilterContainer.classList.add('slds-hide');
        }
    }

    function populateSituationsSelect() {
        situationSelect.innerHTML = '<option value="">Choisir une situation...</option>';
        allSituations.forEach(sit => {
            situationSelect.add(new Option(sit.Name, sit.Name));
        });
    }

    /**
     * Affiche les détails d'une structure
     */
    function displayDetails(structure) {
        detailStructureName.textContent = structure.Structure;
        structureDetailsContent.innerHTML = '';

        // Bloc principal
        renderStructureBlock(structure, true);

        // Enfants
        const children = allStructures.filter(s => s.Parent === structure.Structure);
        if (children.length > 0) {
            children.forEach(child => renderStructureBlock(child, false));
        }

        structureDetailsContainer.classList.remove('slds-hide');
    }

    function renderStructureBlock(struct, isMain) {
        const box = document.createElement('div');
        box.className = `slds-col slds-size_1-of-1 slds-m-bottom_small slds-box slds-box_x-small ${isMain ? 'slds-theme_default' : 'slds-theme_shade'}`;

        const header = document.createElement('div');
        header.className = 'slds-grid slds-grid_vertical-align-center slds-m-bottom_small';

        // On n'affiche le bouton d'édition que pour la structure principal (celle sélectionnée)
        const editButtonHtml = isMain ? `
            <div class="slds-col slds-no-flex">
                <button class="slds-button slds-button_brand edit-activation-btn" data-structure="${struct.Structure}">
                    ✏️ Éditer l'Activation
                </button>
            </div>` : '';

        const isEmergencyClosed = (struct.Etat === "Fermeture d'urgence");
        const statusBadge = isEmergencyClosed ?
            `<span class="slds-badge slds-theme_error slds-m-left_small">🚨 FERMETURE D'URGENCE</span>` : '';

        header.innerHTML = `
            <div class="slds-col">
                <h3 class="slds-text-heading_label">
                    ${struct.Structure} (${struct.Type})
                    ${statusBadge}
                </h3>
            </div>
            ${editButtonHtml}
        `;

        const content = document.createElement('div');
        content.className = 'slds-text-body_small';

        const sits = struct.Situations || {};
        if (Object.keys(sits).length > 0) {
            let html = '<strong>Situations actives :</strong><ul class="slds-list_dotted">';
            Object.entries(sits).forEach(([name, data]) => {
                const datePart = data.DateDebut ? ` du ${data.DateDebut}${data.HeureDebut ? ' ' + data.HeureDebut : ''} au ${data.DateFin || '?'}${data.HeureFin ? ' ' + data.HeureFin : ''}` : '';
                html += `<li><strong>${name}</strong>${datePart} (Prio: ${data.Preponderance})</li>`;
            });
            html += '</ul>';
            content.innerHTML = html;
        } else {
            content.textContent = 'Aucune situation configurée.';
        }

        box.appendChild(header);
        box.appendChild(content);
        structureDetailsContent.appendChild(box);

        const editBtn = header.querySelector('.edit-activation-btn');
        if (editBtn) {
            editBtn.addEventListener('click', () => openActivationModal(struct));
        }
    }

    /**
     * Modal Activation
     */
    function openActivationModal(struct) {
        currentStructure = struct;
        editorStructureName.value = struct.Structure;
        editorEtatToggle.checked = (struct.Etat === "Fermeture d'urgence");
        tempActiveSituations = JSON.parse(JSON.stringify(struct.Situations || {}));

        // Nettoyage des anciennes données (suppression de la clé Periods si elle existe)
        Object.values(tempActiveSituations).forEach(sit => {
            if (sit.Periods) delete sit.Periods;
        });

        renderActiveSituationsInModal();
        recapContainer.classList.add('slds-hide');

        activationModal.classList.add('slds-fade-in-open');
        modalBackdrop.classList.add('slds-backdrop_open');
    }

    function renderActiveSituationsInModal() {
        activeSituationsList.innerHTML = '';
        const entries = Object.entries(tempActiveSituations);

        if (entries.length === 0) {
            activeSituationsList.innerHTML = '<p class="slds-text-color_weak slds-p-around_small">Aucune situation affectée.</p>';
            return;
        }

        entries.forEach(([name, data]) => {
            const div = document.createElement('div');
            div.className = 'slds-box slds-box_xx-small slds-m-bottom_x-small slds-grid slds-grid_vertical-align-center';
            div.innerHTML = `
                <div class="slds-col slds-grow">
                    <strong>${name}</strong> (Prio: ${data.Preponderance})
                    <div class="slds-text-body_small slds-text-color_weak">
                        ${data.DateDebut ? `Du ${data.DateDebut} ${data.HeureDebut || ''} au ${data.DateFin || '?'} ${data.HeureFin || ''}` : ''}
                    </div>
                </div>
                <div class="slds-col slds-no-flex">
                    <button class="slds-button slds-button_icon slds-button_icon-border edit-periods-btn slds-m-right_x-small" title="Editer la période">
                        📅
                    </button>
                    <button class="slds-button slds-button_icon slds-button_icon-error remove-sit-btn" title="Retirer">
                        ❌
                    </button>
                </div>
            `;
            div.querySelector('.edit-periods-btn').addEventListener('click', () => openPeriodsModal(name));
            div.querySelector('.remove-sit-btn').addEventListener('click', () => {
                delete tempActiveSituations[name];
                renderActiveSituationsInModal();
            });
            activeSituationsList.appendChild(div);
        });
    }

    function showSituationRecap() {
        const sitName = situationSelect.value;
        if (!sitName) {
            recapContainer.classList.add('slds-hide');
            selectedSituationToRecord = null;
            return;
        }

        selectedSituationToRecord = allSituations.find(s => s.Name === sitName);
        if (selectedSituationToRecord) {
            recapName.textContent = selectedSituationToRecord.Name;
            let html = `<p>Priorité : <strong>${selectedSituationToRecord.Priority}</strong></p>`;
            html += '<p class="slds-text-color_info">Note : Les périodes seront à définir après ajout à la structure.</p>';
            recapContent.innerHTML = html;
            recapContainer.classList.remove('slds-hide');
        }
    }

    function addSelectedSituation() {
        if (!selectedSituationToRecord) return;

        tempActiveSituations[selectedSituationToRecord.Name] = {
            Preponderance: selectedSituationToRecord.Priority.toString()
        };

        renderActiveSituationsInModal();
        recapContainer.classList.add('slds-hide');
        situationSelect.value = '';
    }

    /**
     * Gestion de la période
     */
    function openPeriodsModal(sitName) {
        currentEditingSitName = sitName;
        periodsModalSitName.textContent = sitName;

        const data = tempActiveSituations[sitName];

        // Convertir DD/MM/YYYY vers YYYY-MM-DD pour les inputs
        editPeriodStartDate.value = reverseFormatDate(data.DateDebut);
        editPeriodStartTime.value = data.HeureDebut || "00:00";
        editPeriodEndDate.value = reverseFormatDate(data.DateFin);
        editPeriodEndTime.value = data.HeureFin || "23:59";

        periodsModal.classList.add('slds-fade-in-open');
        periodsModalBackdrop.classList.add('slds-backdrop_open');
    }

    function closePeriodsModal() {
        periodsModal.classList.remove('slds-fade-in-open');
        periodsModalBackdrop.classList.remove('slds-backdrop_open');
    }

    function savePeriods() {
        if (!currentEditingSitName) return;

        const startD = editPeriodStartDate.value;
        const startT = editPeriodStartTime.value;
        const endD = editPeriodEndDate.value;
        const endT = editPeriodEndTime.value;

        const sitData = tempActiveSituations[currentEditingSitName];

        // Suppression radicale de la clé Periods
        delete sitData.Periods;

        // Gestion de la Date/Heure Debut
        if (startD) {
            sitData.DateDebut = formatDate(startD);
            sitData.HeureDebut = startT || "00:00";
        } else {
            delete sitData.DateDebut;
            delete sitData.HeureDebut;
        }

        // Gestion de la Date/Heure Fin
        if (endD) {
            sitData.DateFin = formatDate(endD);
            sitData.HeureFin = endT || "23:59";
        } else {
            delete sitData.DateFin;
            delete sitData.HeureFin;
        }

        closePeriodsModal();
        renderActiveSituationsInModal();
    }

    function clearPeriods() {
        editPeriodStartDate.value = "";
        editPeriodStartTime.value = "";
        editPeriodEndDate.value = "";
        editPeriodEndTime.value = "";
    }

    async function saveActivation() {
        if (!currentStructure) return;

        // Purge de sécurité : on s'assure qu'aucune situation n'embarque la clé Periods
        Object.values(tempActiveSituations).forEach(sit => {
            if (sit.Periods) delete sit.Periods;
        });

        const updatedData = {
            ...currentStructure,
            Etat: editorEtatToggle.checked ? "Fermeture d'urgence" : "",
            Situations: Object.keys(tempActiveSituations).length > 0 ? tempActiveSituations : undefined
        };

        if (!updatedData.Situations) delete updatedData.Situations;

        try {
            saveActivationBtn.disabled = true;
            await window.dynamoDBService.put(STRUCTURES_TABLE, updatedData);
            showToast("Activation mise à jour", 'success');
            closeModal();
            await loadStructures(); // Refresh data

            // Refresh display for the current structure
            const refreshed = allStructures.find(s => s.Structure === currentStructure.Structure);
            if (refreshed) displayDetails(refreshed);
        } catch (err) {
            console.error(err);
        } finally {
            saveActivationBtn.disabled = false;
        }
    }

    function closeModal() {
        activationModal.classList.remove('slds-fade-in-open');
        modalBackdrop.classList.remove('slds-backdrop_open');
    }

    function formatDate(isoDate) {
        if (!isoDate) return '';
        const [y, m, d] = isoDate.split('-');
        return `${d}/${m}/${y}`;
    }

    function reverseFormatDate(frDate) {
        if (!frDate) return '';
        const [d, m, y] = frDate.split('/');
        return `${y}-${m}-${d}`;
    }

    function showToast(msg, type) {
        if (window.showToast) window.showToast(msg, type);
        else alert(msg);
    }

    function setupEventListeners() {
        marqueSelect.addEventListener('change', () => {
            const val = marqueSelect.value;
            if (val) {
                const s = allStructures.find(it => it.Structure === val);
                displayDetails(s);
                populateDomaines(val);
            } else {
                structureDetailsContainer.classList.add('slds-hide');
            }
        });

        domaineSelect.addEventListener('change', () => {
            const val = domaineSelect.value;
            if (val) {
                const s = allStructures.find(it => it.Structure === val);
                displayDetails(s);
                populateSousDomaines(val);
            } else {
                // Revenir au détails de la marque
                const marqueVal = marqueSelect.value;
                if (marqueVal) {
                    const s = allStructures.find(it => it.Structure === marqueVal);
                    displayDetails(s);
                }
                sousDomaineFilterContainer.classList.add('slds-hide');
            }
        });

        sousDomaineSelect.addEventListener('change', () => {
            const val = sousDomaineSelect.value;
            if (val) {
                const s = allStructures.find(it => it.Structure === val);
                displayDetails(s);
            } else {
                // Revenir au détails du domaine
                const domaineVal = domaineSelect.value;
                if (domaineVal) {
                    const s = allStructures.find(it => it.Structure === domaineVal);
                    displayDetails(s);
                }
            }
        });

        situationSelect.addEventListener('change', showSituationRecap);
        addSituationBtn.addEventListener('click', addSelectedSituation);
        saveActivationBtn.addEventListener('click', saveActivation);
        closeModalBtn.addEventListener('click', closeModal);
        cancelModalBtn.addEventListener('click', closeModal);

        // Period modal listeners
        savePeriodsBtn.addEventListener('click', savePeriods);
        clearPeriodsBtn.addEventListener('click', clearPeriods);
        closePeriodsModalBtn.addEventListener('click', closePeriodsModal);
        cancelPeriodsModalBtn.addEventListener('click', closePeriodsModal);
    }

    init();
});
