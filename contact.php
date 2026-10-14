<?php
// Formularz kontaktowy Banat Studios — wysyła zapytanie e-mailem (działa na zwykłym hostingu z PHP, np. home.pl).
// Ustaw adres odbiorcy poniżej.
const TO = 'kontakt@banatstudios.pl';
const FROM = 'formularz@banatstudios.pl'; // adres w Twojej domenie, inaczej poczta może trafić do spamu

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['ok' => false]); exit; }
// pułapka na boty
if (!empty($_POST['website'])) { echo json_encode(['ok' => true]); exit; }

function field(string $k, int $max): string {
  $v = isset($_POST[$k]) ? (string) $_POST[$k] : '';
  $v = trim(str_replace(["\0"], '', $v));
  return mb_substr($v, 0, $max);
}
$name    = field('name', 120);
$email   = field('email', 200);
$company = field('company', 200);
$product = field('product', 400);
$message = field('message', 5000);

if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) { http_response_code(422); echo json_encode(['ok' => false]); exit; }

// prosty limit: 1 wiadomość na 30 s z jednego adresu IP
$ipKey = sys_get_temp_dir() . '/bs_' . md5($_SERVER['REMOTE_ADDR'] ?? '');
if (is_file($ipKey) && time() - filemtime($ipKey) < 30) { http_response_code(429); echo json_encode(['ok' => false]); exit; }
@touch($ipKey);

$oneLine = fn(string $s) => preg_replace('/[\r\n]+/', ' ', $s); // ochrona przed wstrzyknięciem nagłówków
$subject = '=?UTF-8?B?' . base64_encode('Zapytanie ze strony: ' . $oneLine($product !== '' ? $product : ($company !== '' ? $company : $name))) . '?=';
$body = "Imię: $name\nE-mail: $email\nFirma / www: $company\nProdukt: $product\n\n$message\n";
$headers = implode("\r\n", [
  'From: Banat Studios <' . FROM . '>',
  'Reply-To: ' . $oneLine($email),
  'MIME-Version: 1.0',
  'Content-Type: text/plain; charset=UTF-8',
  'Content-Transfer-Encoding: 8bit',
]);

$ok = @mail(TO, $subject, $body, $headers);
http_response_code($ok ? 200 : 500);
echo json_encode(['ok' => (bool) $ok]);
