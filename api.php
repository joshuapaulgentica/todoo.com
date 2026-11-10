<?php
// api.php : one file that handles register, login, logout and task CRUD.
// Default XAMPP MySQL: user "root", empty password. Change below if yours differs.
session_start();
header('Content-Type: application/json; charset=utf-8');

function out($data, $code = 200) {
  http_response_code($code);
  echo json_encode($data);
  exit;
}

try {
  $db = new PDO('mysql:host=localhost;dbname=todo_app;charset=utf8mb4', 'root', '', [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
  ]);
} catch (PDOException $e) {
  out(['error' => 'Database error. Start MySQL in XAMPP and import database.sql.'], 500);
}

$action = $_GET['action'] ?? '';
$in = json_decode(file_get_contents('php://input'), true) ?: [];
$uid = $_SESSION['uid'] ?? null;

if ($action !== 'me' && $action !== 'list' && $_SERVER['REQUEST_METHOD'] !== 'POST') {
  out(['error' => 'Use POST'], 405);
}

function clean_progress($v) { return max(0, min(100, (int)$v)); }

/* ---------- Accounts ---------- */
if ($action === 'register') {
  $name = trim($in['name'] ?? '');
  $email = strtolower(trim($in['email'] ?? ''));
  $pass = $in['password'] ?? '';
  if ($name === '' || mb_strlen($name) > 60) out(['error' => 'Please enter your name (max 60 letters).'], 422);
  if (!filter_var($email, FILTER_VALIDATE_EMAIL)) out(['error' => 'Please enter a valid email.'], 422);
  if (strlen($pass) < 6) out(['error' => 'Password must be at least 6 characters.'], 422);

  $check = $db->prepare('SELECT id FROM users WHERE email = ?');
  $check->execute([$email]);
  if ($check->fetch()) out(['error' => 'That email already has an account.'], 409);

  $ins = $db->prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)');
  $ins->execute([$name, $email, password_hash($pass, PASSWORD_DEFAULT)]);
  session_regenerate_id(true);
  $_SESSION['uid'] = (int)$db->lastInsertId();
  $_SESSION['name'] = $name;
  out(['name' => $name]);
}

if ($action === 'login') {
  $stmt = $db->prepare('SELECT id, name, password_hash FROM users WHERE email = ?');
  $stmt->execute([strtolower(trim($in['email'] ?? ''))]);
  $user = $stmt->fetch();
  if (!$user || !password_verify($in['password'] ?? '', $user['password_hash'])) {
    out(['error' => 'Wrong email or password.'], 401);
  }
  session_regenerate_id(true);
  $_SESSION['uid'] = (int)$user['id'];
  $_SESSION['name'] = $user['name'];
  out(['name' => $user['name']]);
}

if ($action === 'logout') {
  session_destroy();
  out(['ok' => true]);
}

if ($action === 'me') {
  out(['name' => $uid ? $_SESSION['name'] : null]);
}

/* ---------- Tasks (only for the logged-in user) ---------- */
if (!$uid) out(['error' => 'Please log in.'], 401);

if ($action === 'list') {
  $stmt = $db->prepare('SELECT id, title, notes, progress FROM tasks WHERE user_id = ? ORDER BY id DESC');
  $stmt->execute([$uid]);
  out($stmt->fetchAll());
}

if ($action === 'add' || $action === 'update') {
  $title = trim($in['title'] ?? '');
  $notes = trim($in['notes'] ?? '');
  if ($title === '' || mb_strlen($title) > 120) out(['error' => 'Task title is required (max 120 letters).'], 422);
  if (mb_strlen($notes) > 500) out(['error' => 'Notes are too long (max 500).'], 422);
  $progress = clean_progress($in['progress'] ?? 0);

  if ($action === 'add') {
    $stmt = $db->prepare('INSERT INTO tasks (user_id, title, notes, progress) VALUES (?, ?, ?, ?)');
    $stmt->execute([$uid, $title, $notes, $progress]);
  } else {
    $stmt = $db->prepare('UPDATE tasks SET title = ?, notes = ?, progress = ? WHERE id = ? AND user_id = ?');
    $stmt->execute([$title, $notes, $progress, (int)($in['id'] ?? 0), $uid]);
  }
  out(['ok' => true]);
}

if ($action === 'delete') {
  $stmt = $db->prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?');
  $stmt->execute([(int)($in['id'] ?? 0), $uid]);
  out(['ok' => true]);
}

out(['error' => 'Unknown action'], 400);