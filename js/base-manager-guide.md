/**
 * BASE-MANAGER - GUIDE D'UTILISATION
 *
 * Le BaseManager est une classe réutilisable qui encapsule tous les patterns CRUD
 * communs à tous les managers (DNIS, Segments, Guides, Structures, etc.)
 *
 * ===== AVANTAGES =====
 * ✅ Réduction code dupliqué (économie ~40% lignes par manager)
 * ✅ Maintenance centralisée - un bug fix profite à tous
 * ✅ Cohérence UI/UX uniforme - tous les managers se comportent pareil
 * ✅ Extensibilité - customiser via callbacks, pas besoin modifier BaseManager
 * ✅ Testabilité - tester BaseManager une fois, tous les managers sont testés
 *
 * ===== ARCHITECTURE =====
 *
 * BaseManager fournit:
 * - Gestion du cycle de vie (init, load, render)
 * - Opérations CRUD (create, read, update, delete)
 * - Gestion des modales et formulaires
 * - Gestion de l'état (item courant, mode édition, unsaved changes)
 * - Validation et feedback utilisateur
 *
 * Chaque manager spécialisé (ex: DNISManager) hérite de BaseManager et ajoute:
 * - Logique métier spécifique (modules, structures, etc)
 * - Rendu personnalisé (affichage détails, formulaire)
 * - Validations métier
 * - Actions supplémentaires (drag-drop, multi-select, etc)
 *
 * ===== EXEMPLE D'UTILISATION =====
 *
 * // 1. Créer une classe spécialisée qui hérité de BaseManager
 *
 * class DNISManager extends window.BaseManager {
 *     constructor() {
 *         super({
 *             // Configuration
 *             tableName: 'Core_Ddb_CollecteParametrage',
 *             primaryKey: 'Dnis',
 *             itemName: 'DNIS',
 *             pluralName: 'DNIS',
 *
 *             // DOM elements
 *             selectElement: document.getElementById('dnis-select'),
 *             detailsContainer: document.getElementById('dnis-details-container'),
 *             modalElement: document.getElementById('dnis-editor-modal'),
 *             backdropElement: document.getElementById('editor-backdrop'),
 *             editorFormElement: document.getElementById('dnis-form'),
 *
 *             // Boutons
 *             buttons: {
 *                 new: document.getElementById('new-dnis-btn'),
 *                 edit: document.getElementById('edit-dnis-btn'),
 *                 duplicate: document.getElementById('duplicate-dnis-btn'),
 *                 delete: document.getElementById('delete-dnis-btn'),
 *                 save: document.getElementById('save-dnis-btn'),
 *                 close: document.getElementById('close-editor-btn'),
 *                 cancel: document.getElementById('cancel-editor-btn')
 *             },
 *
 *             // Callbacks pour logique métier spécifique
 *             callbacks: {
 *                 // Appelé AVANT charger la liste
 *                 beforeLoad: async () => {
 *                     // Pré-traitement
 *                 },
 *
 *                 // Appelé APRÈS charger la liste
 *                 afterLoad: async (items) => {
 *                     // Post-traitement (ex: load modules, calendriers)
 *                     await this.loadModules();
 *                     await this.loadCalendars();
 *                 },
 *
 *                 // Appelé AVANT valider et sauvegarder
 *                 beforeSave: async (item) => {
 *                     // Validations métier complexes
 *                     if (item.someField === 'invalid') {
 *                         window.showToast('Erreur métier', 'error');
 *                         return false; // Aborter sauvegarde
 *                     }
 *                     return true; // Continuer sauvegarde
 *                 },
 *
 *                 // Appelé APRÈS sauvegarde réussie
 *                 afterSave: async (item) => {
 *                     // Logique post-sauvegarde
 *                 },
 *
 *                 // Validation du formulaire
 *                 validateForm: (item) => {
 *                     const errors = [];
 *                     if (!item.Dnis) errors.push('Le DNIS est requis');
 *                     if (!item.Marque) errors.push('La marque est requise');
 *                     return errors; // Retourner [] si valide
 *                 },
 *
 *                 // Peuplage du formulaire avec les données
 *                 populateForm: (item, form) => {
 *                     form.querySelector('[name=\"Dnis\"]').value = item.Dnis || '';
 *                     form.querySelector('[name=\"Marque\"]').value = item.Marque || '';
 *                     // Gérer les éléments complexes (modules, etc)
 *                     this.renderModulesInForm(item.Modules);
 *                 },
 *
 *                 // Extraction des données du formulaire
 *                 extractForm: (form) => {
 *                     return {
 *                         Dnis: form.querySelector('[name=\"Dnis\"]').value,
 *                         Marque: form.querySelector('[name=\"Marque\"]').value,
 *                         Modules: this.extractModulesFromForm(),
 *                         // ... autres champs
 *                     };
 *                 },
 *
 *                 // Rendu personnalisé des détails
 *                 renderDetails: (item, container) => {
 *                     container.innerHTML = `
 *                         <h3>${item.Dnis}</h3>
 *                         <p>Marque: ${item.Marque}</p>
 *                         <p>Modules: ${item.Modules?.length || 0}</p>
 *                     `;
 *                 }
 *             }
 *         });
 *
 *         // Mettre en place événements spécifiques après init
 *         this.setupDNISSpecificListeners();
 *     }
 *
 *     // Méthodes spécifiques au DNIS (ajouter ici, pas dans BaseManager)
 *     async loadModules() {
 *         // Charger les modules disponibles
 *     }
 *
 *     setupDNISSpecificListeners() {
 *         // Event listeners spécifiques DNIS (ex: drag-drop modules)
 *     }
 * }
 *
 * // 2. Initialiser le manager quand le DOM est prêt
 * document.addEventListener('DOMContentLoaded', () => {
 *     window.dnisManager = new DNISManager();
 * });
 *
 * // 3. Utiliser l'API publique du manager
 * window.dnisManager.refresh();
 * window.dnisManager.selectByKey('MY_DNIS_123');
 * const item = window.dnisManager.getCurrentItem();
 * const items = window.dnisManager.getItems();
 *
 *
 * ===== MIGRATION D'UN MANAGER EXISTANT =====
 *
 * Exemple: Refactoriser dnis-manager.js
 *
 * AVANT (967 lignes):
 *   - Gestion manuelle select, modal, form
 *   - Logique CRUD dupliquée
 *   - Code pour open/close modal manuel
 *
 * APRÈS (~150 lignes):
 *   - Hériter de BaseManager
 *   - Implémenter uniquement logique métier
 *   - Callbacks pour la customisation
 *   - Réduction ~85% du code boilerplate
 *
 * ===== API PUBLIQUE BASEMANAGER =====
 *
 * Méthodes disponibles dans tous les managers:
 *
 * // Cycle de vie
 * manager.init()                      // Initialiser (appelé auto)
 * manager.load()                      // Recharger liste depuis DynamoDB
 * manager.refresh()                   // Alias pour load()
 *
 * // Navigation
 * manager.selectByKey(key)            // Sélectionner un élément
 * manager.getCurrentItem()            // Obtenir l'item courant
 * manager.getItems()                  // Obtenir tous les items
 *
 * // Opérations
 * manager.openNew()                   // Ouvrir modal création
 * manager.openEdit()                  // Ouvrir modal édition
 * manager.openDuplicate()             // Ouvrir modal duplication
 * manager.save()                      // Sauvegarder
 * manager.delete()                    // Supprimer
 * manager.confirmDelete()             // Confirmer puis supprimer
 *
 * // État
 * manager.isDirty                     // Boolean - y a des changements?
 * manager.isEditMode                  // Boolean - mode édition?
 * manager.isLoading                   // Boolean - chargement en cours?
 *
 * ===== ARCHITECTURE PATTERNS =====
 *
 * Chaque manager devrait suivre ce pattern:
 *
 * js/
 * ├── base-manager.js                 // Classe réutilisable (FONDATION)
 * ├── dnis-manager.js                 // DNISManager extends BaseManager
 * ├── segments-manager.js             // SegmentsManager extends BaseManager
 * ├── guides-manager.js               // GuidesManager extends BaseManager
 * ├── structure-manager.js            // StructureManager extends BaseManager
 * ├── parcours-manager.js             // ParcoursManager extends BaseManager
 * └── ...
 *
 * ===== CHECKLIST DE MIGRATION =====
 *
 * Pour migrer un manager existant:
 *
 * ☐ Analyser la logique métier spécifique vs boilerplate CRUD
 * ☐ Créer une classe qui hérite de BaseManager
 * ☐ Implémenter les callbacks (populateForm, extractForm, validateForm, renderDetails)
 * ☐ Tester que CRUD fonctionne (load, create, edit, delete)
 * ☐ Ajouter logique métier spécifique comme méthodes de la classe
 * ☐ Supprimer le code dupliqué de CRUD
 * ☐ Vérifier que les HTML/CSS n'ont pas changé
 * ☐ Tester end-to-end
 * ☐ Réduire lignes de code (cible: 60-70% réduction)
 * ☐ Ajouter à documentation (ce fichier)
 *
 * ===== AVANTAGES POUR LA MAINTENANCE =====
 *
 * Avant BaseManager:
 * - 5 managers × 1000 lignes = 5000 lignes code dupliqué
 * - Bug dans openModal() = fix dans 5 fichiers
 * - Changement UX = 5 fichiers à modifier
 * - Difficile d'ajouter nouveau manager (copier/coller)
 *
 * Après BaseManager:
 * - 1 base-manager.js × 500 lignes = 500 lignes code réutilisé
 * - 5 managers × 150 lignes = 750 lignes code métier
 * - Total: 1250 lignes vs 5000 lignes (-75%)
 * - Bug dans openModal() = fix 1 fois dans BaseManager
 * - Changement UX = 1 fichier à modifier
 * - Nouveau manager = créer classe qui hérite + callbacks
 *
 * ===== PROCHAINES ÉTAPES =====
 *
 * Phase 1: Créer base-manager.js ✅ DONE
 * Phase 2: Refactoriser dnis-manager.js avec BaseManager
 * Phase 3: Refactoriser segments-manager.js avec BaseManager
 * Phase 4: Refactoriser autres managers progressivement
 * Phase 5: Ajouter pattern state management optionnel
 * Phase 6: Ajouter tests unitaires pour BaseManager
 */
