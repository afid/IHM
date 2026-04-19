/**
 * aws-config.js
 *
 * CONFIGURATION DE LA CONNEXION À AMAZON (AWS) :
 * Ce script récupère les clés d'accès que vous avez saisies lors de la connexion
 * et les donne aux outils Amazon pour qu'ils sachent qui vous êtes
 * et vous autorisent à lire ou modifier les calendriers.
 */
(function () {
    const accessKey = sessionStorage.getItem('aws_accessKey');
    const secretKey = sessionStorage.getItem('aws_secretKey');
    const sessionToken = sessionStorage.getItem('aws_sessionToken');
    const region = sessionStorage.getItem('aws_region') || 'eu-central-1';
    
    // Configuration Amazon Connect
    window.CONNECT_CONFIG = {
        InstanceId: null, // Sera récupéré dynamiquement depuis DynamoDB (Core_Ddb_IHM)
        Region: 'eu-central-1'
    };

    if (accessKey && secretKey) {
        AWS.config.update({
            accessKeyId: accessKey,
            secretAccessKey: secretKey,
            sessionToken: sessionToken || undefined,
            region: region
        });
    } else {
        console.error("Identifiants AWS manquants. Redirection vers login.html.");
        if (window.location.pathname.split('/').pop() !== 'login.html') {
            window.location.href = 'login.html';
        }
    }

    /**
     * Gère les erreurs AWS de manière centralisée.
     * Si l'erreur est liée à l'authentification (session expirée, clés invalides),
     * déconnecte l'utilisateur et le renvoie vers la page de login.
     */
    window.handleAWSError = function (err, customMessage = "") {
        console.error("Erreur AWS détectée:", err.code, err.message || err);

        const code = err.code || '';
        const status = err.statusCode || 0;
        const msg = err.message || '';

        // Auth : session expirée ou clés invalides → redirection login
        const authCodes = ['ExpiredTokenException', 'UnrecognizedClientException', 'InvalidSignatureException', 'InvalidAccessKeyId'];
        const isAuthError = authCodes.includes(code) || (status === 400 && msg.includes('token'));

        if (isAuthError) {
            sessionStorage.clear();
            setTimeout(() => {
                if (window.location.pathname.split('/').pop() !== 'login.html') {
                    window.location.href = 'login.html?reason=expired';
                }
            }, 500);
            return true;
        }

        // Catégorisation des erreurs non-auth
        let userMessage = customMessage;

        if (!userMessage) {
            if (code === 'AccessDeniedException' || status === 403) {
                userMessage = "Vous n'avez pas les droits nécessaires pour cette action.";
            } else if (code === 'ValidationException') {
                userMessage = "Format de données invalide. Vérifiez les champs saisis.";
            } else if (code === 'ThrottlingException' || code === 'ProvisionedThroughputExceededException') {
                userMessage = "Trop de requêtes simultanées, veuillez patienter quelques secondes.";
            } else if (code === 'NetworkingError' || code === 'TimeoutError') {
                userMessage = "Problème de connexion réseau. Vérifiez votre connexion internet.";
            } else if (code === 'ResourceNotFoundException') {
                userMessage = "La ressource demandée est introuvable.";
            } else if (code === 'ConditionalCheckFailedException') {
                userMessage = "Cette ressource a été modifiée par un autre utilisateur. Rechargez la page.";
            } else {
                userMessage = msg || "Une erreur est survenue.";
            }
        }

        if (window.showToast) {
            window.showToast(userMessage, 'error', 5000);
        }

        return false;
    };
})();
