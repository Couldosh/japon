<?php
/**
 * Relais same-origin vers le backend ClaudeApiTkt (ia.faburisu.com), authentifié par un
 * Service Token Cloudflare Access. Le navigateur ne parle qu'à ce domaine (japon.kidsgonflablesparty.nc) ;
 * ce script fait l'appel serveur-à-serveur — évite tout problème de cookie/CORS cross-site
 * (voir la mémoire "project-ai-backend-cloudflare-oauth" côté ClaudeApiTkt pour l'historique).
 *
 * Le Service Token (Client ID/Secret) n'est plus codé en dur ici : les deux placeholders
 * ci-dessous sont substitués par le workflow de déploiement (.github/workflows/deploy.yml,
 * step "Injection des secrets Cloudflare Access") juste avant l'upload FTP, à partir des
 * secrets du dépôt GitHub (Settings > Secrets and variables > Actions) — jamais commités.
 * En local (`ng serve`), ce fichier n'est pas exécuté (voir environment.ts, iaApiUrl pointe
 * en dev directement sur le backend) donc les placeholders non substitués n'y posent pas de
 * problème.
 *
 * Appelé via une URL du type /api/ai.php/description (PATH_INFO), voir environment.prod.ts
 * (iaApiUrl: '/api/ai.php') et IaService, qui construit les chemins par simple concatenation.
 */

$clientId = '__CF_ACCESS_CLIENT_ID__';
$clientSecret = '__CF_ACCESS_CLIENT_SECRET__';

$backendBase = 'https://ia.faburisu.com/ai';

$pathInfo = $_SERVER['PATH_INFO'] ?? '';
$routesAutorisees = ['/description', '/plats', '/resume-quotidien', '/plat-info', '/recherche-restaurant', '/recherche-lieu'];

header('Content-Type: application/json');

if (!in_array($pathInfo, $routesAutorisees, true)) {
    http_response_code(404);
    echo json_encode(['detail' => 'Not Found']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['detail' => 'Method Not Allowed']);
    exit;
}

$corpsRequete = file_get_contents('php://input');

$ch = curl_init($backendBase . $pathInfo);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $corpsRequete);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'CF-Access-Client-Id: ' . $clientId,
    'CF-Access-Client-Secret: ' . $clientSecret,
]);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 300);

// DEBUG TEMPORAIRE (diagnostic du 302 Cloudflare Access, à retirer une fois résolu) : capture
// Location/WWW-Authenticate de la réponse amont sans rien changer au comportement normal —
// exposées seulement si le header X-Debug-Ai-Relay est présent, jamais envoyé par l'app.
$debugHeadersAmont = [];
curl_setopt($ch, CURLOPT_HEADERFUNCTION, function ($curl, $enteteBrut) use (&$debugHeadersAmont) {
    $parties = explode(':', $enteteBrut, 2);
    if (count($parties) === 2) {
        $nom = strtolower(trim($parties[0]));
        if (in_array($nom, ['location', 'www-authenticate'], true)) {
            $debugHeadersAmont[$nom] = trim($parties[1]);
        }
    }
    return strlen($enteteBrut);
});

$reponse = curl_exec($ch);
$statut = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$erreurCurl = curl_error($ch);
$erreurNo = curl_errno($ch);
curl_close($ch);

if (($_SERVER['HTTP_X_DEBUG_AI_RELAY'] ?? '') === 'lieu-diag-1') {
    header('X-Debug-Upstream-Status: ' . $statut);
    header('X-Debug-Upstream-Location: ' . ($debugHeadersAmont['location'] ?? '(absent)'));
    header('X-Debug-Upstream-WWW-Authenticate: ' . ($debugHeadersAmont['www-authenticate'] ?? '(absent)'));
}

if ($reponse === false) {
    http_response_code($erreurNo === CURLE_OPERATION_TIMEDOUT ? 504 : 502);
    echo json_encode(['detail' => 'Erreur du relais IA: ' . $erreurCurl]);
    exit;
}

http_response_code($statut);
echo $reponse;
