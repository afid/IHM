/**
 * login.js
 *
 * CE FICHIER GÈRE LA CONNEXION À AWS.
 * Il récupère ce que l'utilisateur a tapé (Clés, Région),
 * et demande à Amazon Web Services si ces informations sont correctes.
 */
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const notifBox = document.getElementById('notification-box');
    const submitBtn = document.getElementById('submitBtn');

    function showNotification(message, type) {
        notifBox.textContent = message;
        notifBox.className = type === 'error' ? 'notif-error' : 'notif-success';
        notifBox.style.display = 'block';
    }

    // --- VÉRIFICATION DU PARAMÈTRE DE REDIRECTION ---
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('reason') === 'expired') {
        showNotification("Votre session AWS a expiré. Veuillez vous reconnecter.", "error");
    }

    if (loginForm) {
        loginForm.addEventListener('submit', function (e) {
            e.preventDefault();

            const accessKey = document.getElementById('accessKey').value.trim();
            const secretKey = document.getElementById('secretKey').value.trim();
            const sessionToken = document.getElementById('sessionToken').value.trim();
            const region = document.getElementById('region').value;

            // On empêche le bouton d'être cliqué deux fois pendant qu'on cherche
            submitBtn.disabled = true;
            submitBtn.textContent = 'Vérification...'; // On change le texte du bouton
            notifBox.style.display = 'none'; // On cache les anciens messages d'erreur

            // Configuer AWS avec les identifiants saisis
            AWS.config.update({
                accessKeyId: accessKey,
                secretAccessKey: secretKey,
                sessionToken: sessionToken || undefined,
                region: region
            });

            const sts = new AWS.STS();

            sts.getCallerIdentity({}, function (err, data) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Se Connecter';

                if (err) {
                    console.error("Erreur de connexion AWS:", err.message || err);
                    // On traduit les messages d'erreur techniques en français compréhensible
                    let errorMsg = "Erreur : " + err.message;
                    if (err.code === 'InvalidClientTokenId') errorMsg = "Clé d'accès (Access Key) invalide.";
                    if (err.code === 'SignatureDoesNotMatch') errorMsg = "Clé secrète (Secret Key) incorrecte.";
                    if (err.code === 'ExpiredToken') errorMsg = "Le Session Token a expiré.";

                    showNotification(errorMsg, 'error');
                } else {
                    // La connexion est bonne ! On stocke l'identité de l'utilisateur
                    sessionStorage.setItem('ihm_auth_user', data.Arn.split('/').pop());

                    showNotification("Connexion réussie ! Identité : " + sessionStorage.getItem('ihm_auth_user'), 'success');

                    // On sauvegarde les clés temporairement pour que les autres pages du site puissent les utiliser
                    // SÉCURITÉ : sessionStorage uniquement (disparaît à la fermeture de l'onglet)
                    sessionStorage.setItem('aws_accessKey', accessKey);
                    sessionStorage.setItem('aws_secretKey', secretKey);
                    sessionStorage.setItem('aws_sessionToken', sessionToken || '');
                    sessionStorage.setItem('aws_region', region);

                    // On redirige vers la page d'accueil après 1,2 secondes
                    setTimeout(() => {
                        window.location.href = 'index.html';
                    }, 1200);
                }
            });
        });
    }

    // --- LOGIQUE "SE RAPPELER DE MOI" ---
    // Si la case est cochée, on sauvegarde les infos dans la mémoire locale du navigateur (localStorage).
    // Sinon, on efface tout.
    const rememberMe = document.getElementById('rememberMe');
    const fields = ['accessKey', 'secretKey', 'sessionToken', 'region'];

    // Fonction pour charger les données sauvegardées
    function loadSavedData() {
        const isRememberEnabled = localStorage.getItem('aws_remember_me') === 'true';
        if (isRememberEnabled && rememberMe) {
            rememberMe.checked = true;
            fields.forEach(fieldId => {
                const savedValue = localStorage.getItem('aws_' + fieldId);
                const element = document.getElementById(fieldId);
                if (savedValue && element) {
                    element.value = savedValue;
                }
            });
        }
    }

    // Fonction pour sauvegarder/effacer les données
    function updateSavedData() {
        if (rememberMe && rememberMe.checked) {
            localStorage.setItem('aws_remember_me', 'true');
            // SÉCURITÉ : On ne sauvegarde QUE la région et éventuellement l'AccessKey,
            // mais JAMAIS la SecretKey ou le SessionToken dans le localStorage.
            localStorage.setItem('aws_accessKey', document.getElementById('accessKey').value);
            localStorage.setItem('aws_region', document.getElementById('region').value);

            // On s'assure que les données sensibles ne sont PAS dans le localStorage
            localStorage.removeItem('aws_secretKey');
            localStorage.removeItem('aws_sessionToken');
        } else {
            localStorage.setItem('aws_remember_me', 'false');
            fields.forEach(fieldId => {
                localStorage.removeItem('aws_' + fieldId);
            });
            localStorage.removeItem('aws_accessKey');
            localStorage.removeItem('aws_region');
        }
    }

    if (rememberMe) {
        // Charger au démarrage
        loadSavedData();

        // Écouter les changements sur la checkbox
        rememberMe.addEventListener('change', updateSavedData);

        // Écouter les changements sur chaque champ pour mettre à jour la sauvegarde si actif
        fields.forEach(fieldId => {
            const element = document.getElementById(fieldId);
            if (element) {
                element.addEventListener('input', () => {
                    if (rememberMe.checked) updateSavedData();
                });
            }
        });
    }
});
