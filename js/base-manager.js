/**
 * base-manager.js
 *
 * CLASSE DE BASE RÉUTILISABLE POUR TOUS LES MANAGERS
 * Encapsule les patterns CRUD communs (Create, Read, Update, Delete)
 * pour éviter la duplication de code entre:
 * - dnis-manager.js
 * - segments-manager.js
 * - guides-manager.js
 * - structure-manager.js
 * - etc.
 *
 * Responsabilités:
 * - Gestion du cycle de vie (init, load, render)
 * - Opérations CRUD (create, read, update, delete)
 * - Gestion des modales (open, close, backdrop)
 * - Gestion de l'état (current item, edit mode, unsaved changes)
 * - Validation et feedback utilisateur
 */

class BaseManager {
    constructor(config) {
        // Configuration requise
        this.tableName = config.tableName; // Table DynamoDB
        this.primaryKey = config.primaryKey || 'id'; // Clé primaire
        this.itemName = config.itemName || 'Item'; // Nom de l'élément (ex: "DNIS", "Segment")
        this.pluralName = config.pluralName || 'Items'; // Nom au pluriel

        // Éléments DOM
        this.selectElement = config.selectElement; // Select dropdown
        this.detailsContainer = config.detailsContainer; // Container pour afficher détails
        this.modalElement = config.modalElement; // Modal editor
        this.backdropElement = config.backdropElement; // Backdrop
        this.editorFormElement = config.editorFormElement; // Formulaire

        // Boutons d'action
        this.buttons = {
            new: config.buttons?.new,
            edit: config.buttons?.edit,
            duplicate: config.buttons?.duplicate,
            delete: config.buttons?.delete,
            save: config.buttons?.save,
            close: config.buttons?.close,
            cancel: config.buttons?.cancel
        };

        // Callbacks personnalisés pour logique métier spécifique
        this.callbacks = {
            beforeLoad: config.callbacks?.beforeLoad || null,
            afterLoad: config.callbacks?.afterLoad || null,
            beforeSave: config.callbacks?.beforeSave || null,
            afterSave: config.callbacks?.afterSave || null,
            beforeDelete: config.callbacks?.beforeDelete || null,
            afterDelete: config.callbacks?.afterDelete || null,
            validateForm: config.callbacks?.validateForm || null,
            populateForm: config.callbacks?.populateForm || null,
            extractForm: config.callbacks?.extractForm || null,
            renderDetails: config.callbacks?.renderDetails || null
        };

        // État interne
        this.items = []; // Liste des éléments
        this.currentItem = null; // Élément actuellement sélectionné
        this.isEditMode = false; // Mode édition ou création
        this.isDirty = false; // Changements non sauvegardés
        this.isLoading = false;

        this.init();
    }

    /**
     * Initialise le manager et attache les event listeners
     */
    init() {
        this.attachEventListeners();
        this.load();
    }

    /**
     * Attache les event listeners sur les boutons et éléments
     */
    attachEventListeners() {
        if (this.selectElement) {
            this.selectElement.addEventListener('change', (e) => this.onSelectChange(e));
        }

        if (this.buttons.new) {
            this.buttons.new.addEventListener('click', () => this.openNew());
        }

        if (this.buttons.edit) {
            this.buttons.edit.addEventListener('click', () => this.openEdit());
        }

        if (this.buttons.duplicate) {
            this.buttons.duplicate.addEventListener('click', () => this.openDuplicate());
        }

        if (this.buttons.delete) {
            this.buttons.delete.addEventListener('click', () => this.confirmDelete());
        }

        if (this.buttons.save) {
            this.buttons.save.addEventListener('click', () => this.save());
        }

        if (this.buttons.close) {
            this.buttons.close.addEventListener('click', () => this.closeModal());
        }

        if (this.buttons.cancel) {
            this.buttons.cancel.addEventListener('click', () => this.closeModal());
        }

        if (this.backdropElement) {
            this.backdropElement.addEventListener('click', () => this.closeModal());
        }

        // Marquer comme dirty quand form change
        if (this.editorFormElement) {
            this.editorFormElement.addEventListener('input', () => {
                this.isDirty = true;
            });
            this.editorFormElement.addEventListener('change', () => {
                this.isDirty = true;
            });
        }
    }

    /**
     * Charge la liste des éléments depuis DynamoDB
     */
    async load() {
        try {
            this.isLoading = true;

            if (this.callbacks.beforeLoad) {
                await this.callbacks.beforeLoad();
            }

            const params = { TableName: this.tableName };
            this.items = await window.dynamoDBService.scan(this.tableName, {}) || [];

            // Trier par clé primaire ou nom
            this.items.sort((a, b) => {
                const aVal = a.Nom || a[this.primaryKey] || '';
                const bVal = b.Nom || b[this.primaryKey] || '';
                return aVal.localeCompare(bVal);
            });

            this.render();

            if (this.callbacks.afterLoad) {
                await this.callbacks.afterLoad(this.items);
            }
        } catch (err) {
            console.error(`Erreur lors du chargement de ${this.tableName}:`, err);
            window.showToast(`Erreur lors du chargement des ${this.pluralName.toLowerCase()}`, 'error');
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Restitue la liste dans le select dropdown
     */
    render() {
        if (!this.selectElement) return;

        const currentValue = this.selectElement.value;
        this.selectElement.innerHTML = '<option value="">-- Sélectionner un ' + this.itemName.toLowerCase() + ' --</option>';

        this.items.forEach(item => {
            const key = item[this.primaryKey];
            const label = item.Nom || key;
            const option = document.createElement('option');
            option.value = key;
            option.textContent = label;
            this.selectElement.appendChild(option);
        });

        // Restaurer la sélection si possible
        if (currentValue && this.items.find(i => i[this.primaryKey] === currentValue)) {
            this.selectElement.value = currentValue;
            this.onSelectChange();
        }
    }

    /**
     * Callback quand le select change
     */
    async onSelectChange() {
        const key = this.selectElement?.value;
        if (key) {
            await this.loadDetails(key);
        } else {
            this.clearDetails();
        }
    }

    /**
     * Charge les détails d'un élément
     */
    async loadDetails(key) {
        try {
            const item = this.items.find(i => i[this.primaryKey] === key);
            if (item) {
                this.currentItem = item;
                this.displayDetails(item);
            }
        } catch (err) {
            console.error(`Erreur lors du chargement des détails:`, err);
            window.showToast('Erreur lors du chargement des détails', 'error');
        }
    }

    /**
     * Affiche les détails de l'élément courant
     */
    displayDetails(item) {
        if (this.callbacks.renderDetails) {
            this.callbacks.renderDetails(item, this.detailsContainer);
        } else {
            // Rendu par défaut - afficher tous les champs
            if (this.detailsContainer) {
                this.detailsContainer.innerHTML = `<pre>${JSON.stringify(item, null, 2)}</pre>`;
            }
        }
    }

    /**
     * Efface les détails affichés
     */
    clearDetails() {
        this.currentItem = null;
        if (this.detailsContainer) {
            this.detailsContainer.innerHTML = '';
        }
    }

    /**
     * Ouvre la modale pour créer un nouvel élément
     */
    openNew() {
        this.currentItem = null;
        this.isEditMode = false;
        this.isDirty = false;
        this.clearForm();
        this.openModal('Créer un nouveau ' + this.itemName);
    }

    /**
     * Ouvre la modale pour éditer l'élément courant
     */
    openEdit() {
        if (!this.currentItem) {
            window.showToast('Sélectionnez un ' + this.itemName.toLowerCase() + ' à éditer', 'info');
            return;
        }
        this.isEditMode = true;
        this.isDirty = false;
        this.populateForm(this.currentItem);
        this.openModal('Éditer ' + this.itemName);
    }

    /**
     * Ouvre la modale pour dupliquer l'élément courant
     */
    openDuplicate() {
        if (!this.currentItem) {
            window.showToast('Sélectionnez un ' + this.itemName.toLowerCase() + ' à dupliquer', 'info');
            return;
        }
        this.isEditMode = false;
        this.isDirty = false;
        // Copier l'élément et nettoyer la clé primaire
        const duplicate = JSON.parse(JSON.stringify(this.currentItem));
        delete duplicate[this.primaryKey];
        duplicate.Nom = (duplicate.Nom || '') + ' (Copie)';
        this.populateForm(duplicate);
        this.openModal('Dupliquer ' + this.itemName);
    }

    /**
     * Ouvre la modale
     */
    openModal(title) {
        if (this.modalElement) {
            this.modalElement.classList.add('slds-fade-in-open');
        }
        if (this.backdropElement) {
            this.backdropElement.classList.add('slds-backdrop_open');
        }
    }

    /**
     * Ferme la modale avec vérification des changements non sauvegardés
     */
    closeModal() {
        if (this.isDirty) {
            window.showConfirmModal(
                'Modifications non sauvegardées',
                'Vous avez des changements non sauvegardés. Voulez-vous vraiment fermer ?',
                () => this.doCloseModal()
            );
        } else {
            this.doCloseModal();
        }
    }

    /**
     * Ferme effectivement la modale
     */
    doCloseModal() {
        if (this.modalElement) {
            this.modalElement.classList.remove('slds-fade-in-open');
        }
        if (this.backdropElement) {
            this.backdropElement.classList.remove('slds-backdrop_open');
        }
        this.isDirty = false;
    }

    /**
     * Peuple le formulaire avec les données de l'élément
     */
    populateForm(item) {
        if (this.callbacks.populateForm) {
            this.callbacks.populateForm(item, this.editorFormElement);
        }
        this.isDirty = false;
    }

    /**
     * Vide le formulaire
     */
    clearForm() {
        if (this.editorFormElement) {
            this.editorFormElement.reset();
        }
        this.isDirty = false;
    }

    /**
     * Extrait les données du formulaire
     */
    extractForm() {
        if (this.callbacks.extractForm) {
            return this.callbacks.extractForm(this.editorFormElement);
        }

        // Extraction par défaut - tous les inputs
        const formData = new FormData(this.editorFormElement);
        const item = {};
        formData.forEach((value, key) => {
            item[key] = value;
        });
        return item;
    }

    /**
     * Valide les données du formulaire
     */
    validateForm(item) {
        if (this.callbacks.validateForm) {
            const errors = this.callbacks.validateForm(item);
            if (errors && errors.length > 0) {
                window.showToast(errors[0], 'error');
                return false;
            }
        }
        return true;
    }

    /**
     * Sauvegarde l'élément (créer ou mettre à jour)
     */
    async save() {
        try {
            // Extraire et valider
            const item = this.extractForm();
            if (!this.validateForm(item)) {
                return;
            }

            if (this.callbacks.beforeSave) {
                const ok = await this.callbacks.beforeSave(item);
                if (!ok) return;
            }

            // Ajouter clé primaire si création
            if (!this.isEditMode && !item[this.primaryKey]) {
                item[this.primaryKey] = this.generateKey(item);
            }

            // Sauvegarder
            await window.dynamoDBService.put(this.tableName, item);

            window.showToast(`${this.itemName} sauvegardé avec succès`, 'success');

            if (this.callbacks.afterSave) {
                await this.callbacks.afterSave(item);
            }

            this.isDirty = false;
            this.doCloseModal();
            await this.load();

        } catch (err) {
            console.error(`Erreur lors de la sauvegarde:`, err);
            window.showToast(`Erreur lors de la sauvegarde du ${this.itemName.toLowerCase()}`, 'error');
        }
    }

    /**
     * Supprime l'élément courant après confirmation
     */
    confirmDelete() {
        if (!this.currentItem) {
            window.showToast('Sélectionnez un ' + this.itemName.toLowerCase() + ' à supprimer', 'info');
            return;
        }

        window.showConfirmModal(
            'Confirmation de suppression',
            `Êtes-vous sûr de vouloir supprimer "${this.currentItem.Nom || this.currentItem[this.primaryKey]}" ?`,
            () => this.delete()
        );
    }

    /**
     * Supprime l'élément courant
     */
    async delete() {
        try {
            if (!this.currentItem) return;

            if (this.callbacks.beforeDelete) {
                const ok = await this.callbacks.beforeDelete(this.currentItem);
                if (!ok) return;
            }

            await window.dynamoDBService.delete(this.tableName, {
                [this.primaryKey]: this.currentItem[this.primaryKey]
            });

            window.showToast(`${this.itemName} supprimé avec succès`, 'success');

            if (this.callbacks.afterDelete) {
                await this.callbacks.afterDelete(this.currentItem);
            }

            this.currentItem = null;
            this.clearDetails();
            await this.load();

        } catch (err) {
            console.error(`Erreur lors de la suppression:`, err);
            window.showToast(`Erreur lors de la suppression du ${this.itemName.toLowerCase()}`, 'error');
        }
    }

    /**
     * Génère une clé primaire (à surcharger si besoin)
     */
    generateKey(item) {
        // Par défaut, utiliser le nom ou générer UUID
        if (item.Nom) {
            return item.Nom.replace(/\s+/g, '_').toUpperCase();
        }
        return 'ITEM_' + Date.now();
    }

    /**
     * API publique pour recharger les données
     */
    async refresh() {
        await this.load();
    }

    /**
     * API publique pour sélectionner un élément par clé
     */
    selectByKey(key) {
        if (this.selectElement) {
            this.selectElement.value = key;
            this.selectElement.dispatchEvent(new Event('change'));
        }
    }

    /**
     * API publique pour obtenir l'élément courant
     */
    getCurrentItem() {
        return this.currentItem;
    }

    /**
     * API publique pour obtenir tous les éléments
     */
    getItems() {
        return this.items;
    }

    /**
     * API publique pour ajouter des filtres avant affichage
     */
    setFilter(filterFn) {
        this.filterFunction = filterFn;
        this.render();
    }
}

// Exporter la classe globalement
window.BaseManager = BaseManager;
