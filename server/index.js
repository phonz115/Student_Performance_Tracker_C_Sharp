const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { pool, testConnection } = require("./db");

const app = express();
const PORT = Number(process.env.PORT || 5000);
const PASSWORD_HASH_PREFIX = "p2";
const PASSWORD_ITERATIONS = 120000;
const PASSWORD_KEY_LENGTH = 32;
const PASSWORD_DIGEST = "sha256";
const MAX_LOGIN_ATTEMPTS = 5;
const ACCOUNT_LOCK_MS = 15 * 60 * 1000;
const PASSWORD_RESET_EXPIRY_MS = 20 * 60 * 1000;
const SESSION_COOKIE_NAME = "classiq_session";
const SESSION_EXPIRY_MS = 30 * 60 * 1000;
const API_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const API_RATE_LIMIT_MAX_REQUESTS = 300;
const STUDENT_PROGRAMS = new Set(["BSIT", "BSCS", "BSEMC"]);
const loginAttempts = new Map();
const sessions = new Map();
const passwordResetRequestLimits = new Map();
const PASSWORD_RESET_REQUEST_WINDOW_MS = 15 * 60 * 1000;
const PASSWORD_RESET_REQUEST_MAX = 5;
const apiRateLimits = new Map();

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || /^http:\/\/localhost:517\d+$/.test(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));
app.use(express.json({ limit: "2mb" }));

const getClientIp = (req) => req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";

const logRequest = (req, res, next) => {
  const startedAt = Date.now();

  res.on("finish", () => {
    console.info(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - startedAt}ms ip=${getClientIp(req)}`);
  });

  next();
};

const safeLogError = (message, error) => {
  console.error(`${message}: ${error?.code || error?.name || "Error"}`);
};

const enforceHttpsInProduction = (req, res, next) => {
  if (process.env.NODE_ENV === "production" && !req.secure && req.headers["x-forwarded-proto"] !== "https") {
    return res.status(403).json({ message: "HTTPS is required" });
  }

  return next();
};

const apiRateLimiter = (req, res, next) => {
  if (!req.path.startsWith("/api")) {
    return next();
  }

  const key = getClientIp(req);
  const now = Date.now();
  const current = apiRateLimits.get(key) || { count: 0, resetAt: now + API_RATE_LIMIT_WINDOW_MS };

  if (now > current.resetAt) {
    apiRateLimits.set(key, { count: 1, resetAt: now + API_RATE_LIMIT_WINDOW_MS });
    return next();
  }

  if (current.count >= API_RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({ message: "Too many requests. Please try again later." });
  }

  current.count += 1;
  apiRateLimits.set(key, current);
  return next();
};

app.use(enforceHttpsInProduction);
app.use(logRequest);
app.use(apiRateLimiter);

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""));
const isValidUserId = (id) => /^[A-Za-z0-9 _-]{2,40}$/.test(String(id || ""));

const stripControlCharacters = (value) => {
  return Array.from(value).filter((character) => {
    const code = character.charCodeAt(0);

    return code > 31 && code !== 127;
  }).join("");
};

const sanitizeText = (value, maxLength = 255) => {
  return stripControlCharacters(String(value || "").trim())
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .slice(0, maxLength);
};

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const normalizeRole = (role) => String(role || "").trim().toLowerCase();

const normalizeIdentifier = (identifier) => String(identifier || "").trim();

const normalizeStudentProgram = (program) => {
  const normalizedProgram = sanitizeText(program, 100).toUpperCase();

  return STUDENT_PROGRAMS.has(normalizedProgram) ? normalizedProgram : "BSIT";
};

const validatePassword = (password) => {
  const value = String(password || "");

  if (value.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(value)) return "Password must include at least one uppercase letter";
  if (!/[0-9]/.test(value)) return "Password must include at least one number";
  if (!/[^A-Za-z0-9]/.test(value)) return "Password must include at least one special character";

  return "";
};

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = crypto
    .pbkdf2Sync(String(password), salt, PASSWORD_ITERATIONS, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST)
    .toString("base64url");

  return `${PASSWORD_HASH_PREFIX}$${PASSWORD_ITERATIONS}$${salt}$${hash}`;
};

const timingSafeEqual = (left, right) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const verifyPassword = (password, storedPassword) => {
  if (!storedPassword) return false;

  if (!String(storedPassword).startsWith(`${PASSWORD_HASH_PREFIX}$`) && !String(storedPassword).startsWith("pbkdf2_sha256$")) {
    return String(storedPassword) === String(password);
  }

  const [prefix, iterations, salt, storedHash] = String(storedPassword).split("$");
  const keyLength = prefix === "pbkdf2_sha256" ? 64 : PASSWORD_KEY_LENGTH;
  const encoding = prefix === "pbkdf2_sha256" ? "hex" : "base64url";
  const candidateHash = crypto
    .pbkdf2Sync(String(password), salt, Number(iterations), keyLength, PASSWORD_DIGEST)
    .toString(encoding);

  return timingSafeEqual(candidateHash, storedHash);
};

const getAttemptKey = (identifier, role) => `${role}:${String(identifier).trim().toLowerCase()}`;

const getLockedAttempt = (key) => {
  const attempt = loginAttempts.get(key);

  if (!attempt?.lockedUntil) return null;
  if (Date.now() > attempt.lockedUntil) {
    loginAttempts.delete(key);
    return null;
  }

  return attempt;
};

const recordFailedLogin = (key) => {
  const current = loginAttempts.get(key) || { count: 0, lockedUntil: null };
  const count = current.count + 1;
  const lockedUntil = count >= MAX_LOGIN_ATTEMPTS ? Date.now() + ACCOUNT_LOCK_MS : null;

  loginAttempts.set(key, { count, lockedUntil });
  return { count, lockedUntil };
};

const createToken = () => crypto.randomBytes(32).toString("hex");

const isPasswordResetEmailConfigured = () =>
  Boolean(process.env.SMTP_USER?.trim() && process.env.SMTP_APP_PASSWORD?.trim());

const canRequestPasswordReset = (key) => {
  const now = Date.now();
  const current = passwordResetRequestLimits.get(key);

  if (!current || now >= current.resetAt) {
    passwordResetRequestLimits.set(key, { count: 1, resetAt: now + PASSWORD_RESET_REQUEST_WINDOW_MS });
    return true;
  }

  if (current.count >= PASSWORD_RESET_REQUEST_MAX) return false;
  passwordResetRequestLimits.set(key, { ...current, count: current.count + 1 });
  return true;
};

const hashPasswordResetToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const sendPasswordResetEmail = async (email, token, role) => {
  const smtpUser = process.env.SMTP_USER.trim();
  const smtpPassword = process.env.SMTP_APP_PASSWORD.replace(/\s/g, "");
  const appBaseUrl = process.env.APP_BASE_URL || "http://localhost:5173";
  const resetUrl = new URL("/reset-password", appBaseUrl);

  if (process.env.NODE_ENV === "production" && resetUrl.protocol !== "https:") {
    throw new Error("APP_BASE_URL must use HTTPS in production.");
  }

  resetUrl.searchParams.set("token", token);
  resetUrl.searchParams.set("role", role);
  const safeResetUrl = resetUrl.toString().replace(/&/g, "&amp;");
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: smtpUser, pass: smtpPassword },
  });

  await transporter.sendMail({
    from: { name: "ClassIQ", address: smtpUser },
    to: email,
    subject: "Reset your ClassIQ password",
    text: "Use this one-time link to reset your ClassIQ password. It expires in 20 minutes: " + resetUrl.toString(),
    html: [
      "<p>We received a request to reset your ClassIQ password.</p>",
      '<p><a href="' + safeResetUrl + '">Reset your password</a></p>',
      "<p>This link can be used once and expires in 20 minutes. If you did not request this, you can ignore this email.</p>",
    ].join(""),
  });
};

const parseCookies = (cookieHeader = "") => {
  return cookieHeader.split(";").reduce((cookies, cookiePart) => {
    const [rawName, ...rawValue] = cookiePart.trim().split("=");

    if (rawName) {
      cookies[rawName] = decodeURIComponent(rawValue.join("="));
    }

    return cookies;
  }, {});
};

const setAuthCookie = (res, token) => {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: SESSION_EXPIRY_MS,
    path: "/",
  });
};

const clearAuthCookie = (res) => {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
  });
};

const getSessionFromRequest = (req) => {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE_NAME];
  const session = token ? sessions.get(token) : null;

  if (!token || !session) {
    return null;
  }

  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }

  return { token, ...session };
};

const requireAuth = (req, res, next) => {
  const session = getSessionFromRequest(req);

  if (!session) {
    clearAuthCookie(res);
    return res.status(401).json({ message: "Unauthorized" });
  }

  req.sessionToken = session.token;
  req.user = session.user;
  return next();
};

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  return next();
};

const createSession = (user) => {
  const token = createToken();
  sessions.set(token, {
    user,
    expiresAt: Date.now() + SESSION_EXPIRY_MS,
  });

  return token;
};

const columnExists = async (tableName, columnName) => {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );

  return Number(rows[0]?.count || 0) > 0;
};

const tableExists = async (tableName) => {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?`,
    [tableName]
  );

  return Number(rows[0]?.count || 0) > 0;
};

const ensureColumn = async (tableName, columnName, definition) => {
  if (!(await columnExists(tableName, columnName))) {
    await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
};

const trySchemaChange = async (description, query) => {
  try {
    await pool.query(query);
  } catch (error) {
    safeLogError(`Schema update skipped (${description})`, error);
  }
};

const ensureApplicationSchema = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(40) PRIMARY KEY,
      email VARCHAR(100) NOT NULL UNIQUE,
      firstname VARCHAR(100) NULL,
      lastname VARCHAR(100) NULL,
      name VARCHAR(180) NULL,
      role VARCHAR(20) NOT NULL,
      password VARCHAR(255) NOT NULL
    ) ENGINE=InnoDB
  `);

  await pool.query("CREATE TABLE IF NOT EXISTS password_reset_tokens (token_hash CHAR(64) PRIMARY KEY, user_id VARCHAR(40) NOT NULL, expires_at BIGINT NOT NULL, created_at BIGINT NOT NULL, INDEX idx_password_reset_user_id (user_id)) ENGINE=InnoDB");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS subjects (
      subject_id INT AUTO_INCREMENT PRIMARY KEY,
      subject_name VARCHAR(100) NOT NULL,
      teacher_id VARCHAR(40) NULL
    ) ENGINE=InnoDB
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS grades (
      id INT AUTO_INCREMENT PRIMARY KEY,
      student_id VARCHAR(40) NOT NULL,
      subject_id INT NULL,
      subject VARCHAR(100) NULL,
      teacher_id VARCHAR(40) NULL,
      score DECIMAL(5,2) NOT NULL,
      feedback TEXT,
      school_year VARCHAR(20) NOT NULL DEFAULT '2025-2026',
      semester VARCHAR(40) NOT NULL DEFAULT '1st Semester',
      term VARCHAR(40) NOT NULL DEFAULT 'Prelim'
    ) ENGINE=InnoDB
  `);

  await trySchemaChange("subjects.teacher_id nullable", "ALTER TABLE subjects MODIFY teacher_id VARCHAR(40) NULL");

  if (await tableExists("users")) {
    await ensureColumn("users", "name", "VARCHAR(180) NULL");
    await ensureColumn("users", "firstname", "VARCHAR(100) NULL");
    await ensureColumn("users", "lastname", "VARCHAR(100) NULL");
    await ensureColumn("users", "course", "VARCHAR(100) DEFAULT ''");
    await ensureColumn("users", "school_year", "VARCHAR(20) NOT NULL DEFAULT '2025-2026'");
    await ensureColumn("users", "semester", "VARCHAR(40) NOT NULL DEFAULT '1st Semester'");
    await pool.query(
      `UPDATE users
       SET name = TRIM(CONCAT_WS(' ', firstname, lastname))
       WHERE (name IS NULL OR name = '')
         AND (firstname IS NOT NULL OR lastname IS NOT NULL)`
    );
  }

  await ensureDefaultAdminAccount();

  if (await tableExists("grades")) {
    await ensureColumn("grades", "subject_id", "INT NULL");
    await ensureColumn("grades", "subject", "VARCHAR(100) NULL");
    await ensureColumn("grades", "teacher_id", "VARCHAR(40) NULL");
    await ensureColumn("grades", "school_year", "VARCHAR(20) NOT NULL DEFAULT '2025-2026'");
    await ensureColumn("grades", "semester", "VARCHAR(40) NOT NULL DEFAULT '1st Semester'");
    await ensureColumn("grades", "term", "VARCHAR(40) NOT NULL DEFAULT 'Prelim'");
    await trySchemaChange("grades.subject_id nullable", "ALTER TABLE grades MODIFY subject_id INT NULL");
    await trySchemaChange("grades.score decimal", "ALTER TABLE grades MODIFY score DECIMAL(5,2) NOT NULL");
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS teacher_assignments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      teacher_id VARCHAR(40) NOT NULL,
      student_id VARCHAR(40) NOT NULL,
      subject VARCHAR(100) NOT NULL,
      course VARCHAR(100) DEFAULT '',
      section VARCHAR(50) DEFAULT '',
      school_year VARCHAR(20) NOT NULL DEFAULT '2025-2026',
      semester VARCHAR(40) NOT NULL DEFAULT '1st Semester',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_teacher_assignment (teacher_id, student_id, subject, school_year, semester)
    ) ENGINE=InnoDB
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS courses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(40) NOT NULL,
      name VARCHAR(120) NOT NULL,
      description VARCHAR(255) DEFAULT '',
      school_year VARCHAR(20) NOT NULL DEFAULT '2025-2026',
      semester VARCHAR(40) NOT NULL DEFAULT '1st Semester',
      teacher_id VARCHAR(40) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_course_code (code)
    ) ENGINE=InnoDB
  `);

  if (await tableExists("courses")) {
    await ensureColumn("courses", "school_year", "VARCHAR(20) NOT NULL DEFAULT '2025-2026'");
    await ensureColumn("courses", "semester", "VARCHAR(40) NOT NULL DEFAULT '1st Semester'");
  }

  await trySchemaChange("grades.semester default", "ALTER TABLE grades MODIFY semester VARCHAR(40) NOT NULL DEFAULT '1st Semester'");
  await trySchemaChange("teacher_assignments.semester default", "ALTER TABLE teacher_assignments MODIFY semester VARCHAR(40) NOT NULL DEFAULT '1st Semester'");
  await pool.query("UPDATE grades SET semester = '1st Semester' WHERE semester IN ('First Semester', 'Spring', 'Spring 2024')");
  await pool.query("UPDATE grades SET semester = '2nd Semester' WHERE semester IN ('Second Semester', 'Fall', 'Fall 2024')");
  await pool.query("UPDATE teacher_assignments SET semester = '1st Semester' WHERE semester IN ('First Semester', 'Spring', 'Spring 2024')");
  await pool.query("UPDATE teacher_assignments SET semester = '2nd Semester' WHERE semester IN ('Second Semester', 'Fall', 'Fall 2024')");
};

const getUserNameExpression = (alias = "") => {
  const prefix = alias ? `${alias}.` : "";

  return `COALESCE(NULLIF(${prefix}name, ''), NULLIF(TRIM(CONCAT_WS(' ', ${prefix}firstname, ${prefix}lastname)), ''), ${prefix}id)`;
};

const normalizeSchoolYear = (value) => sanitizeText(value || "2025-2026", 20);

const normalizeSemester = (value) => {
  const semester = sanitizeText(value || "1st Semester", 40);
  const lowerSemester = semester.toLowerCase();

  if (["first semester", "1st semester", "spring", "spring 2024"].includes(lowerSemester)) {
    return "1st Semester";
  }

  if (["second semester", "2nd semester", "fall", "fall 2024"].includes(lowerSemester)) {
    return "2nd Semester";
  }

  return semester;
};

const normalizeTerm = (value) => sanitizeText(value || "Prelim", 40);

const ensureDefaultAdminAccount = async () => {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const adminUser = {
    id: "1001",
    email: "admin@school.com",
    firstName: "System",
    lastName: "Admin",
    name: "System Admin",
    role: "admin",
  };
  const [existingRows] = await pool.query(
    "SELECT id, email, role FROM users WHERE id = ? OR email = ? LIMIT 1",
    [adminUser.id, adminUser.email]
  );
  const existingUser = existingRows[0];

  if (existingUser) {
    if (existingUser.id !== adminUser.id || existingUser.email !== adminUser.email || existingUser.role !== "admin") {
      console.warn("A different account already uses the default admin ID or email.");
      return;
    }

    console.info("Default admin account already exists.");
    return;
  }

  const adminValues = [
    adminUser.id,
    adminUser.email,
    adminUser.firstName,
    adminUser.lastName,
    adminUser.name,
    adminUser.role,
    hashPassword("Admin@123"),
  ];

  await pool.query(
    "INSERT INTO users (id, email, firstname, lastname, name, role, password) VALUES (?, ?, ?, ?, ?, ?, ?)",
    adminValues
  );

  console.info("Default admin account is ready: admin@school.com");
};

const isAssignedStudent = async (teacherId, studentId, subject = "") => {
  const params = [teacherId, studentId];
  let subjectFilter = "";

  if (subject) {
    subjectFilter = " AND (subject = ? OR course = ? OR section = ? OR subject = '')";
    params.push(subject, subject, subject);
  }

  const [rows] = await pool.query(
    `SELECT id FROM teacher_assignments
     WHERE teacher_id = ? AND student_id = ?${subjectFilter}
     LIMIT 1`,
    params
  );

  return rows.length > 0;
};

const getVisibleGrades = async (user) => {
  const baseQuery = `SELECT
      id,
      student_id AS studentId,
      COALESCE(NULLIF(subject, ''), CONCAT('Subject ', COALESCE(subject_id, ''))) AS subject,
      score,
      feedback,
      teacher_id AS teacherId,
      school_year AS schoolYear,
      semester,
      term
    FROM grades`;

  if (user.role === "student") {
    const [rows] = await pool.query(`${baseQuery} WHERE student_id = ? ORDER BY id DESC`, [user.id]);
    return rows;
  }

  if (user.role === "teacher") {
    const [rows] = await pool.query(
      `${baseQuery}
       WHERE teacher_id = ?
          OR student_id IN (SELECT student_id FROM teacher_assignments WHERE teacher_id = ?)
       ORDER BY id DESC`,
      [user.id, user.id]
    );
    return rows;
  }

  const [rows] = await pool.query(`${baseQuery} ORDER BY id DESC`);
  return rows;
};

app.get("/", (_req, res) => {
  res.send("API is running");
});

app.get("/api/health", async (_req, res) => {
  try {
    await testConnection();
    res.json({ ok: true, message: "Database connected" });
  } catch (error) {
    safeLogError("Database health check failed", error);
    res.status(500).json({ ok: false, message: "Database connection failed" });
  }
});

const getUsers = async (req, res) => {
  try {
    let rows;
    const nameExpression = getUserNameExpression();

    if (req.user.role === "admin") {
      [rows] = await pool.query(`SELECT id, email, ${nameExpression} AS name, role, course, school_year AS schoolYear, semester FROM users ORDER BY name ASC`);
    } else if (req.user.role === "teacher") {
      [rows] = await pool.query(
        `SELECT DISTINCT u.id, u.email, ${getUserNameExpression("u")} AS name, u.role, u.course, u.school_year AS schoolYear, u.semester
         FROM users u
         WHERE u.role = 'student'
           AND (
             EXISTS (SELECT 1 FROM teacher_assignments ta WHERE ta.student_id = u.id AND ta.teacher_id = ?)
             OR EXISTS (SELECT 1 FROM grades g WHERE g.student_id = u.id AND g.teacher_id = ?)
           )
         ORDER BY name ASC`,
        [req.user.id, req.user.id]
      );
    } else {
      [rows] = await pool.query(
        `SELECT id, email, ${nameExpression} AS name, role, course, school_year AS schoolYear, semester FROM users WHERE id = ? LIMIT 1`,
        [req.user.id]
      );
    }

    res.json(rows);
  } catch (error) {
    safeLogError("Failed to fetch users", error);
    res.status(500).json({ message: "Failed to fetch users" });
  }
};

const getGrades = async (req, res) => {
  try {
    res.json(await getVisibleGrades(req.user));
  } catch (error) {
    safeLogError("Failed to fetch grades", error);
    res.status(500).json({ message: "Failed to fetch grades" });
  }
};

app.get("/api/session", requireAuth, (req, res) => {
  res.json(req.user);
});

app.get("/api/users", requireAuth, getUsers);
app.get("/users", requireAuth, getUsers);
app.get("/api/grades", requireAuth, getGrades);
app.get("/grades", requireAuth, getGrades);

app.post("/api/login", async (req, res) => {
  const { identifier: rawIdentifier, password, role: rawRole } = req.body;
  const identifier = normalizeIdentifier(rawIdentifier);
  const role = normalizeRole(rawRole);

  if (!identifier || !password || !role) {
    return res.status(400).json({ message: "Identifier, password, and role are required" });
  }

  if (!["admin", "teacher", "student"].includes(role)) {
    return res.status(400).json({ message: "Invalid role" });
  }

  const attemptKey = getAttemptKey(identifier, role);
  const lockedAttempt = getLockedAttempt(attemptKey);

  if (lockedAttempt) {
    return res.status(423).json({
      message: "Account locked after 5 failed login attempts. Please try again later.",
      lockedUntil: lockedAttempt.lockedUntil,
    });
  }

  const field = role === "student" ? "id" : "email";

  try {
    const nameExpression = getUserNameExpression();
    const [rows] = await pool.query(
      `SELECT id, email, ${nameExpression} AS name, role, course, school_year AS schoolYear, semester, password
       FROM users
       WHERE ${field} = ? AND role = ?
       LIMIT 1`,
      [identifier, role]
    );

    const user = rows[0];

    if (!user || !verifyPassword(password, user.password)) {
      const failedAttempt = recordFailedLogin(attemptKey);

      if (failedAttempt.lockedUntil) {
        return res.status(423).json({
          message: "Account locked after 5 failed login attempts. Please try again later.",
          lockedUntil: failedAttempt.lockedUntil,
        });
      }

      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!String(user.password).startsWith(`${PASSWORD_HASH_PREFIX}$`)) {
      await pool.query("UPDATE users SET password = ? WHERE id = ?", [hashPassword(password), user.id]);
    }

    loginAttempts.delete(attemptKey);

    const responseUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      course: user.course,
      schoolYear: user.schoolYear,
      semester: user.semester,
    };

    const token = createSession(responseUser);
    setAuthCookie(res, token);

    res.json(responseUser);
  } catch (error) {
    safeLogError("Login failed", error);
    res.status(500).json({ message: "Login failed" });
  }
});

app.post("/api/logout", (req, res) => {
  const session = getSessionFromRequest(req);

  if (session?.token) {
    sessions.delete(session.token);
  }

  clearAuthCookie(res);
  res.json({ ok: true });
});

app.post("/api/password-reset/request", async (req, res) => {
  const identifier = normalizeIdentifier(req.body.identifier);
  const role = normalizeRole(req.body.role);

  if (!identifier || !["admin", "teacher", "student"].includes(role)) {
    return res.status(400).json({ message: "Identifier and valid role are required" });
  }

  if (!isPasswordResetEmailConfigured()) {
    return res.status(503).json({ message: "Password reset email is not configured. Please contact the administrator." });
  }

  const requestKey = crypto
    .createHash("sha256")
    .update(getClientIp(req) + "|" + role + "|" + identifier.toLowerCase())
    .digest("hex");
  if (!canRequestPasswordReset(requestKey)) {
    return res.status(429).json({ message: "Too many reset requests. Please wait before trying again." });
  }

  const field = role === "student" ? "id" : "email";
  const genericMessage = "If the account exists, a password reset link has been sent to its registered email address.";

  try {
    const lookupSql = "SELECT id, email, role FROM users WHERE " + field + " = ? AND role = ? LIMIT 1";
    const [rows] = await pool.query(lookupSql, [identifier, role]);
    const user = rows[0];

    if (user) {
      const token = createToken();
      const tokenHash = hashPasswordResetToken(token);
      const now = Date.now();

      await pool.query(
        "DELETE FROM password_reset_tokens WHERE user_id = ? OR expires_at <= ?",
        [user.id, now]
      );
      await pool.query(
        "INSERT INTO password_reset_tokens (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
        [tokenHash, user.id, now + PASSWORD_RESET_EXPIRY_MS, now]
      );

      try {
        await sendPasswordResetEmail(user.email, token, role);
      } catch (error) {
        await pool.query("DELETE FROM password_reset_tokens WHERE token_hash = ?", [tokenHash]);
        throw error;
      }
    }

    return res.json({ message: genericMessage });
  } catch (error) {
    safeLogError("Password reset request failed", error);
    return res.status(500).json({ message: "We could not send the reset email. Please contact the administrator." });
  }
});

app.post("/api/password-reset/confirm", async (req, res) => {
  const token = String(req.body.token || "").trim();
  const password = String(req.body.password || "");
  const confirmPassword = String(req.body.confirmPassword || "");

  if (!/^[a-f0-9]{64}$/i.test(token)) {
    return res.status(400).json({ message: "Password reset link is invalid or expired" });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ message: "Passwords do not match" });
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return res.status(400).json({ message: passwordError });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const tokenHash = hashPasswordResetToken(token);
    const [rows] = await connection.query(
      "SELECT user_id FROM password_reset_tokens WHERE token_hash = ? AND expires_at > ? LIMIT 1 FOR UPDATE",
      [tokenHash, Date.now()]
    );

    if (!rows.length) {
      await connection.rollback();
      return res.status(400).json({ message: "Password reset link is invalid or expired" });
    }

    const userId = rows[0].user_id;
    const [updateResult] = await connection.query(
      "UPDATE users SET password = ? WHERE id = ?",
      [hashPassword(password), userId]
    );

    if (updateResult.affectedRows !== 1) {
      await connection.rollback();
      return res.status(400).json({ message: "Password reset link is invalid or expired" });
    }

    await connection.query("DELETE FROM password_reset_tokens WHERE user_id = ?", [userId]);
    await connection.commit();

    for (const [sessionToken, session] of sessions) {
      if (session.user?.id === userId) sessions.delete(sessionToken);
    }
    clearAuthCookie(res);

    return res.json({ message: "Password has been reset successfully" });
  } catch (error) {
    await connection.rollback();
    safeLogError("Password reset failed", error);
    return res.status(500).json({ message: "Password reset failed" });
  } finally {
    connection.release();
  }
});

app.post("/api/grades", requireAuth, requireRole("admin", "teacher"), async (req, res) => {
  const studentId = normalizeIdentifier(req.body.studentId);
  const subject = sanitizeText(req.body.subject, 80);
  const score = Number(req.body.score);
  const feedback = sanitizeText(req.body.feedback, 500);
  const schoolYear = normalizeSchoolYear(req.body.schoolYear);
  const semester = normalizeSemester(req.body.semester);
  const term = normalizeTerm(req.body.term);

  if (!studentId || !subject || !Number.isFinite(score)) {
    return res.status(400).json({ message: "studentId, subject, and score are required" });
  }

  if (!isValidUserId(studentId)) {
    return res.status(400).json({ message: "Invalid student ID format" });
  }

  const usesCollegeGradeScale = req.user.role === "teacher";
  const minimumGrade = usesCollegeGradeScale ? 1 : 0;
  const maximumGrade = usesCollegeGradeScale ? 5 : 100;

  if (score < minimumGrade || score > maximumGrade) {
    return res.status(400).json({
      message: usesCollegeGradeScale ? "Grade must be between 1.0 and 5.0" : "Score must be between 0 and 100"
    });
  }

  try {
    const teacherId = req.user.role === "teacher" ? req.user.id : null;

    if (req.user.role === "teacher" && !(await isAssignedStudent(req.user.id, studentId, subject))) {
      return res.status(403).json({ message: "You can only add grades for assigned students" });
    }

    const [studentRows] = await pool.query("SELECT id FROM users WHERE id = ? AND role = 'student' LIMIT 1", [studentId]);

    if (studentRows.length === 0) {
      return res.status(404).json({ message: "Student account not found" });
    }

    const [result] = await pool.query(
      `INSERT INTO grades (student_id, subject, score, feedback, teacher_id, school_year, semester, term)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [studentId, subject, score, feedback || "", teacherId, schoolYear, semester, term]
    );

    const createdGrade = {
      id: result.insertId,
      studentId,
      subject,
      score,
      feedback: feedback || "",
      teacherId,
      schoolYear,
      semester,
      term,
    };


    res.status(201).json({
      ...createdGrade,
    });
  } catch (error) {
    safeLogError("Failed to create grade", error);
    res.status(500).json({ message: "Failed to create grade" });
  }
});

app.put("/api/grades/:id", requireAuth, requireRole("admin", "teacher"), async (req, res) => {
  const gradeId = Number(req.params.id);
  const subject = sanitizeText(req.body.subject, 80);
  const score = Number(req.body.score);
  const feedback = sanitizeText(req.body.feedback, 500);
  const schoolYear = normalizeSchoolYear(req.body.schoolYear);
  const semester = normalizeSemester(req.body.semester);
  const term = normalizeTerm(req.body.term);

  if (!Number.isInteger(gradeId) || gradeId <= 0) {
    return res.status(400).json({ message: "Invalid grade record" });
  }

  if (!subject || !Number.isFinite(score)) {
    return res.status(400).json({ message: "Subject and score are required" });
  }

  try {
    const [existingRows] = await pool.query(
      `SELECT id, student_id AS studentId, subject, score, feedback, teacher_id AS teacherId, school_year AS schoolYear, semester, term
       FROM grades WHERE id = ? LIMIT 1`,
      [gradeId]
    );
    const existingGrade = existingRows[0];

    if (!existingGrade) {
      return res.status(404).json({ message: "Grade record not found" });
    }

    if (req.user.role === "teacher" && existingGrade.teacherId !== req.user.id) {
      return res.status(403).json({ message: "You can only edit grades you added" });
    }

    const usesCollegeGradeScale = req.user.role === "teacher" || Boolean(existingGrade.teacherId);
    const minimumGrade = usesCollegeGradeScale ? 1 : 0;
    const maximumGrade = usesCollegeGradeScale ? 5 : 100;

    if (score < minimumGrade || score > maximumGrade) {
      return res.status(400).json({
        message: usesCollegeGradeScale ? "Grade must be between 1.0 and 5.0" : "Score must be between 0 and 100"
      });
    }

    await pool.query(
      "UPDATE grades SET subject = ?, score = ?, feedback = ?, school_year = ?, semester = ?, term = ? WHERE id = ?",
      [subject, score, feedback || "", schoolYear, semester, term, gradeId]
    );

    const updatedGrade = {
      id: gradeId,
      studentId: existingGrade.studentId,
      subject,
      score,
      feedback: feedback || "",
      teacherId: existingGrade.teacherId,
      schoolYear,
      semester,
      term,
    };


    res.json({
      ...updatedGrade,
    });
  } catch (error) {
    safeLogError("Failed to update grade", error);
    res.status(500).json({ message: "Failed to update grade" });
  }
});

app.delete("/api/grades/:id", requireAuth, requireRole("admin", "teacher"), async (req, res) => {
  const gradeId = Number(req.params.id);

  if (!Number.isInteger(gradeId) || gradeId <= 0) {
    return res.status(400).json({ message: "Invalid grade record" });
  }

  try {
    const [existingRows] = await pool.query(
      "SELECT id, student_id AS studentId, teacher_id AS teacherId FROM grades WHERE id = ? LIMIT 1",
      [gradeId]
    );
    const existingGrade = existingRows[0];

    if (!existingGrade) {
      return res.status(404).json({ message: "Grade record not found" });
    }

    if (req.user.role === "teacher" && existingGrade.teacherId !== req.user.id) {
      return res.status(403).json({ message: "You can only delete grades you added" });
    }

    await pool.query("DELETE FROM grades WHERE id = ?", [gradeId]);
    res.json({ ok: true });
  } catch (error) {
    safeLogError("Failed to delete grade", error);
    res.status(500).json({ message: "Failed to delete grade" });
  }
});

app.post("/api/users", requireAuth, requireRole("admin"), async (req, res) => {
  const id = normalizeIdentifier(req.body.id || req.body.studentId);
  const email = normalizeEmail(req.body.email);
  const name = sanitizeText(req.body.name, 180);
  const role = normalizeRole(req.body.role);
  const password = String(req.body.password || "");
  const course = ["student", "teacher"].includes(role) ? normalizeStudentProgram(req.body.course) : "";
  const schoolYear = normalizeSchoolYear(req.body.schoolYear);
  const semester = normalizeSemester(req.body.semester);

  if (!id || !email || !name || !["admin", "teacher", "student"].includes(role) || !password) {
    return res.status(400).json({ message: "id, name, email, role, and password are required" });
  }

  if (!isValidUserId(id)) {
    return res.status(400).json({ message: "Invalid ID format" });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ message: "Please enter a valid email address" });
  }

  const passwordError = validatePassword(password);

  if (passwordError) {
    return res.status(400).json({ message: passwordError });
  }

  const [firstName, ...remainingNames] = name.split(" ");
  const lastName = remainingNames.join(" ") || firstName;

  try {
    await pool.query(
      `INSERT INTO users (id, email, firstname, lastname, name, role, password, course, school_year, semester)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, email, firstName, lastName, name, role, hashPassword(password), course, schoolYear, semester]
    );
    const createdUser = { id, email, name, role, course, schoolYear, semester };
    res.status(201).json(createdUser);
  } catch (error) {
    safeLogError("Failed to create user", error);
    res.status(500).json({ message: "Failed to create user" });
  }
});

app.put("/api/users/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const id = normalizeIdentifier(req.params.id);
  const email = normalizeEmail(req.body.email);
  const name = sanitizeText(req.body.name, 180);
  const role = normalizeRole(req.body.role);
  const course = ["student", "teacher"].includes(role) ? normalizeStudentProgram(req.body.course) : "";
  const schoolYear = normalizeSchoolYear(req.body.schoolYear);
  const semester = normalizeSemester(req.body.semester);

  if (!id || !email || !name || !["admin", "teacher", "student"].includes(role)) {
    return res.status(400).json({ message: "name, email, and role are required" });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ message: "Please enter a valid email address" });
  }

  const [firstName, ...remainingNames] = name.split(" ");
  const lastName = remainingNames.join(" ") || firstName;

  try {
    const [existingRows] = await pool.query(`SELECT id, email, ${getUserNameExpression()} AS name, role, course, school_year AS schoolYear, semester FROM users WHERE id = ? LIMIT 1`, [id]);

    if (existingRows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    await pool.query(
      "UPDATE users SET email = ?, firstname = ?, lastname = ?, name = ?, role = ?, course = ?, school_year = ?, semester = ? WHERE id = ?",
      [email, firstName, lastName, name, role, course, schoolYear, semester, id]
    );
    const updatedUser = { id, email, name, role, course, schoolYear, semester };
    res.json(updatedUser);
  } catch (error) {
    safeLogError("Failed to update user", error);
    res.status(500).json({ message: "Failed to update user" });
  }
});

app.delete("/api/users/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const id = normalizeIdentifier(req.params.id);

  if (!id || id === req.user.id) {
    return res.status(400).json({ message: "Invalid user delete request" });
  }

  try {
    const [existingRows] = await pool.query(`SELECT id, email, ${getUserNameExpression()} AS name, role FROM users WHERE id = ? LIMIT 1`, [id]);

    if (existingRows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    await pool.query("DELETE FROM grades WHERE student_id = ?", [id]);
    await pool.query("UPDATE grades SET teacher_id = NULL WHERE teacher_id = ?", [id]);
    await pool.query("UPDATE subjects SET teacher_id = NULL WHERE teacher_id = ?", [id]);
    await pool.query("UPDATE courses SET teacher_id = NULL WHERE teacher_id = ?", [id]);
    await pool.query("DELETE FROM teacher_assignments WHERE teacher_id = ? OR student_id = ?", [id, id]);
    await pool.query("DELETE FROM users WHERE id = ?", [id]);
    res.json({ ok: true });
  } catch (error) {
    safeLogError("Failed to delete user", error);
    res.status(500).json({ message: "Failed to delete user" });
  }
});

app.post("/api/users/:id/reset-password", requireAuth, requireRole("admin"), async (req, res) => {
  const id = normalizeIdentifier(req.params.id);
  const password = String(req.body.password || "");
  const passwordError = validatePassword(password);

  if (!id || passwordError) {
    return res.status(400).json({ message: passwordError || "User ID is required" });
  }

  try {
    await pool.query("UPDATE users SET password = ? WHERE id = ?", [hashPassword(password), id]);
    res.json({ message: "Password reset successfully" });
  } catch (error) {
    safeLogError("Failed to reset password", error);
    res.status(500).json({ message: "Failed to reset password" });
  }
});

app.get("/api/teacher-assignments", requireAuth, requireRole("admin", "teacher", "student"), async (req, res) => {
  try {
    const params = [];
    let roleFilter = "";

    if (req.user.role === "teacher") {
      roleFilter = "WHERE teacher_id = ?";
      params.push(req.user.id);
    }

    if (req.user.role === "student") {
      roleFilter = "WHERE student_id = ?";
      params.push(req.user.id);
    }

    const [rows] = await pool.query(
      `SELECT id, teacher_id AS teacherId, student_id AS studentId, subject, course, section, school_year AS schoolYear, semester
       FROM teacher_assignments
       ${roleFilter}
       ORDER BY created_at DESC`,
      params
    );
    res.json(rows);
  } catch (error) {
    safeLogError("Failed to fetch teacher assignments", error);
    res.status(500).json({ message: "Failed to fetch teacher assignments" });
  }
});

app.post("/api/teacher-assignments", requireAuth, requireRole("admin"), async (req, res) => {
  const teacherId = normalizeIdentifier(req.body.teacherId);
  const studentId = normalizeIdentifier(req.body.studentId);
  const subject = sanitizeText(req.body.subject, 100);
  const course = sanitizeText(req.body.course, 100);
  const section = sanitizeText(req.body.section, 50);
  const schoolYear = normalizeSchoolYear(req.body.schoolYear);
  const semester = normalizeSemester(req.body.semester);

  if (!teacherId || !studentId || !subject) {
    return res.status(400).json({ message: "teacherId, studentId, and subject are required" });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO teacher_assignments (teacher_id, student_id, subject, course, section, school_year, semester)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE course = VALUES(course), section = VALUES(section)`,
      [teacherId, studentId, subject, course, section, schoolYear, semester]
    );
    const assignment = { id: result.insertId, teacherId, studentId, subject, course, section, schoolYear, semester };
    res.status(201).json(assignment);
  } catch (error) {
    safeLogError("Failed to save teacher assignment", error);
    res.status(500).json({ message: "Failed to save teacher assignment" });
  }
});

app.delete("/api/teacher-assignments/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const assignmentId = Number(req.params.id);

  if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
    return res.status(400).json({ message: "Invalid assignment" });
  }

  try {
    await pool.query("DELETE FROM teacher_assignments WHERE id = ?", [assignmentId]);
    res.json({ ok: true });
  } catch (error) {
    safeLogError("Failed to delete teacher assignment", error);
    res.status(500).json({ message: "Failed to delete teacher assignment" });
  }
});

app.get("/api/courses", requireAuth, async (_req, res) => {
  try {
    const [rows] = await pool.query("SELECT id, code, name, description, school_year AS schoolYear, semester, teacher_id AS teacherId FROM courses ORDER BY name ASC");
    res.json(rows);
  } catch (error) {
    safeLogError("Failed to fetch courses", error);
    res.status(500).json({ message: "Failed to fetch courses" });
  }
});

const findConflictingCourse = async ({ code, name, schoolYear, semester, excludeId = null }) => {
  const params = [code, name, schoolYear, semester];
  const excludeClause = excludeId ? " AND id <> ?" : "";

  if (excludeId) {
    params.push(excludeId);
  }

  const [rows] = await pool.query(
    `SELECT id, code, name, school_year AS schoolYear, semester, teacher_id AS teacherId
     FROM courses
     WHERE (UPPER(code) = UPPER(?) OR (LOWER(name) = LOWER(?) AND school_year = ? AND semester = ?))${excludeClause}
     LIMIT 1`,
    params
  );

  return rows[0] || null;
};

const getCourseConflictMessage = (conflict, { code, name }) => {
  if (String(conflict.code || "").toUpperCase() === code) {
    return `Duplicate course code "${code}" is not allowed.`;
  }

  if (String(conflict.name || "").trim().toLowerCase() === String(name || "").trim().toLowerCase()) {
    return `Duplicate course title "${name}" for this term is not allowed.`;
  }

  return "Duplicate course input is not allowed.";
};

app.post("/api/courses", requireAuth, requireRole("admin"), async (req, res) => {
  const code = sanitizeText(req.body.code, 40).toUpperCase();
  const name = sanitizeText(req.body.name, 120);
  const description = sanitizeText(req.body.description, 255);
  const schoolYear = normalizeSchoolYear(req.body.schoolYear);
  const semester = normalizeSemester(req.body.semester);
  const teacherId = normalizeIdentifier(req.body.teacherId);

  if (!code || !name) {
    return res.status(400).json({ message: "Course code and name are required" });
  }

  try {
    const conflict = await findConflictingCourse({ code, name, schoolYear, semester });

    if (conflict) {
      return res.status(409).json({ message: getCourseConflictMessage(conflict, { code, name }) });
    }

    const [result] = await pool.query(
      "INSERT INTO courses (code, name, description, school_year, semester, teacher_id) VALUES (?, ?, ?, ?, ?, ?)",
      [code, name, description, schoolYear, semester, teacherId || null]
    );
    const course = { id: result.insertId, code, name, description, schoolYear, semester, teacherId: teacherId || null };
    res.status(201).json(course);
  } catch (error) {
    safeLogError("Failed to create course", error);
    res.status(500).json({ message: "Failed to create course" });
  }
});

app.put("/api/courses/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const courseId = Number(req.params.id);
  const code = sanitizeText(req.body.code, 40).toUpperCase();
  const name = sanitizeText(req.body.name, 120);
  const description = sanitizeText(req.body.description, 255);
  const schoolYear = normalizeSchoolYear(req.body.schoolYear);
  const semester = normalizeSemester(req.body.semester);
  const teacherId = normalizeIdentifier(req.body.teacherId);

  if (!Number.isInteger(courseId) || courseId <= 0) {
    return res.status(400).json({ message: "Invalid course" });
  }

  if (!code || !name) {
    return res.status(400).json({ message: "Course code and name are required" });
  }

  try {
    const [existingRows] = await pool.query("SELECT id, code, name, description, school_year AS schoolYear, semester, teacher_id AS teacherId FROM courses WHERE id = ? LIMIT 1", [courseId]);

    if (existingRows.length === 0) {
      return res.status(404).json({ message: "Course not found" });
    }

    const conflict = await findConflictingCourse({ code, name, schoolYear, semester, excludeId: courseId });

    if (conflict) {
      return res.status(409).json({ message: getCourseConflictMessage(conflict, { code, name }) });
    }

    await pool.query(
      "UPDATE courses SET code = ?, name = ?, description = ?, school_year = ?, semester = ?, teacher_id = ? WHERE id = ?",
      [code, name, description, schoolYear, semester, teacherId || null, courseId]
    );

    const course = { id: courseId, code, name, description, schoolYear, semester, teacherId: teacherId || null };
    res.json(course);
  } catch (error) {
    if (error?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "A course with that code already exists" });
    }

    safeLogError("Failed to update course", error);
    res.status(500).json({ message: "Failed to update course" });
  }
});

app.delete("/api/courses/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const courseId = Number(req.params.id);

  if (!Number.isInteger(courseId) || courseId <= 0) {
    return res.status(400).json({ message: "Invalid course" });
  }

  try {
    const [existingRows] = await pool.query("SELECT id, code, name, description, school_year AS schoolYear, semester, teacher_id AS teacherId FROM courses WHERE id = ? LIMIT 1", [courseId]);

    if (existingRows.length === 0) {
      return res.status(404).json({ message: "Course not found" });
    }

    await pool.query("DELETE FROM courses WHERE id = ?", [courseId]);
    res.json({ ok: true });
  } catch (error) {
    safeLogError("Failed to delete course", error);
    res.status(500).json({ message: "Failed to delete course" });
  }
});

app.get("/api/subjects", requireAuth, async (_req, res) => {
  try {
    const [rows] = await pool.query("SELECT subject_id AS id, subject_name AS name, teacher_id AS teacherId FROM subjects ORDER BY subject_name ASC");
    res.json(rows);
  } catch (error) {
    safeLogError("Failed to fetch subjects", error);
    res.status(500).json({ message: "Failed to fetch subjects" });
  }
});

app.post("/api/subjects", requireAuth, requireRole("admin"), async (req, res) => {
  const name = sanitizeText(req.body.name, 100);
  const teacherId = normalizeIdentifier(req.body.teacherId);

  if (!name || !teacherId) {
    return res.status(400).json({ message: "Subject name and teacher are required" });
  }

  try {
    const [result] = await pool.query("INSERT INTO subjects (subject_name, teacher_id) VALUES (?, ?)", [name, teacherId]);
    const subject = { id: result.insertId, name, teacherId };
    res.status(201).json(subject);
  } catch (error) {
    safeLogError("Failed to create subject", error);
    res.status(500).json({ message: "Failed to create subject" });
  }
});

app.get("/api/backup", requireAuth, requireRole("admin"), async (_req, res) => {
  try {
    const [users] = await pool.query(`SELECT id, email, ${getUserNameExpression()} AS name, role, course, school_year AS schoolYear, semester, password AS passwordHash FROM users ORDER BY id ASC`);
    const [grades] = await pool.query(
      `SELECT id, student_id AS studentId, subject, score, feedback, teacher_id AS teacherId, school_year AS schoolYear, semester, term
       FROM grades ORDER BY id ASC`
    );
    const [assignments] = await pool.query(
      "SELECT id, teacher_id AS teacherId, student_id AS studentId, subject, course, section, school_year AS schoolYear, semester FROM teacher_assignments ORDER BY id ASC"
    );
    const [courses] = await pool.query("SELECT id, code, name, description, school_year AS schoolYear, semester, teacher_id AS teacherId FROM courses ORDER BY id ASC");
    const [subjects] = await pool.query("SELECT subject_id AS id, subject_name AS name, teacher_id AS teacherId FROM subjects ORDER BY subject_id ASC");

    res.json({
      exportedAt: new Date().toISOString(),
      users,
      grades,
      assignments,
      courses,
      subjects,
    });
  } catch (error) {
    safeLogError("Backup failed", error);
    res.status(500).json({ message: "Backup failed" });
  }
});

app.post("/api/restore", requireAuth, requireRole("admin"), async (req, res) => {
  const snapshot = req.body;

  if (!snapshot || typeof snapshot !== "object") {
    return res.status(400).json({ message: "Backup snapshot is required" });
  }

  try {
    const users = Array.isArray(snapshot.users) ? snapshot.users : [];
    const subjects = Array.isArray(snapshot.subjects) ? snapshot.subjects : [];
    const grades = Array.isArray(snapshot.grades) ? snapshot.grades : [];
    const assignments = Array.isArray(snapshot.assignments) ? snapshot.assignments : [];
    const courses = Array.isArray(snapshot.courses) ? snapshot.courses : [];

    for (const user of users) {
      const id = normalizeIdentifier(user.id);
      const name = sanitizeText(user.name, 180);
      const role = normalizeRole(user.role);
      const email = normalizeEmail(user.email);

      if (!id || !name || !isValidEmail(email) || !["admin", "teacher", "student"].includes(role)) {
        continue;
      }

      const [firstName, ...remainingNames] = name.split(" ");
      const lastName = remainingNames.join(" ") || firstName;
      const course = ["student", "teacher"].includes(role) ? normalizeStudentProgram(user.course) : "";
      const schoolYear = normalizeSchoolYear(user.schoolYear);
      const semester = normalizeSemester(user.semester);
      await pool.query(
        `INSERT INTO users (id, email, firstname, lastname, name, role, password, course, school_year, semester)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE email = VALUES(email), firstname = VALUES(firstname), lastname = VALUES(lastname), name = VALUES(name), role = VALUES(role), course = VALUES(course), school_year = VALUES(school_year), semester = VALUES(semester)`,
        [id, email, firstName, lastName, name, role, user.passwordHash || hashPassword("Temp@123"), course, schoolYear, semester]
      );
    }

    for (const course of courses) {
      await pool.query(
        `INSERT INTO courses (code, name, description, school_year, semester, teacher_id)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), school_year = VALUES(school_year), semester = VALUES(semester), teacher_id = VALUES(teacher_id)`,
        [
          sanitizeText(course.code, 40).toUpperCase(),
          sanitizeText(course.name, 120),
          sanitizeText(course.description, 255),
          normalizeSchoolYear(course.schoolYear),
          normalizeSemester(course.semester),
          normalizeIdentifier(course.teacherId) || null,
        ]
      );
    }

    for (const subject of subjects) {
      const name = sanitizeText(subject.name, 100);
      const teacherId = normalizeIdentifier(subject.teacherId);

      if (!name || !teacherId) {
        continue;
      }

      const [existingSubjects] = await pool.query(
        "SELECT subject_id FROM subjects WHERE subject_name = ? AND teacher_id = ? LIMIT 1",
        [name, teacherId]
      );

      if (existingSubjects.length === 0) {
        await pool.query("INSERT INTO subjects (subject_name, teacher_id) VALUES (?, ?)", [name, teacherId]);
      }
    }

    for (const assignment of assignments) {
      await pool.query(
        `INSERT INTO teacher_assignments (teacher_id, student_id, subject, course, section, school_year, semester)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE course = VALUES(course), section = VALUES(section)`,
        [
          normalizeIdentifier(assignment.teacherId),
          normalizeIdentifier(assignment.studentId),
          sanitizeText(assignment.subject, 100),
          sanitizeText(assignment.course, 100),
          sanitizeText(assignment.section, 50),
          normalizeSchoolYear(assignment.schoolYear),
          normalizeSemester(assignment.semester),
        ]
      );
    }

    for (const grade of grades) {
      const studentId = normalizeIdentifier(grade.studentId);
      const subject = sanitizeText(grade.subject, 100);
      const score = Number(grade.score);

      if (!studentId || !subject || !Number.isFinite(score)) {
        continue;
      }

      await pool.query(
        `INSERT INTO grades (id, student_id, subject, score, feedback, teacher_id, school_year, semester, term)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE subject = VALUES(subject), score = VALUES(score), feedback = VALUES(feedback), teacher_id = VALUES(teacher_id), school_year = VALUES(school_year), semester = VALUES(semester), term = VALUES(term)`,
        [
          Number.isInteger(Number(grade.id)) ? Number(grade.id) : null,
          studentId,
          subject,
          score,
          sanitizeText(grade.feedback, 500),
          normalizeIdentifier(grade.teacherId) || null,
          normalizeSchoolYear(grade.schoolYear),
          normalizeSemester(grade.semester),
          normalizeTerm(grade.term),
        ]
      );
    }

    const restored = {
      users: users.length,
      courses: courses.length,
      subjects: subjects.length,
      assignments: assignments.length,
      grades: grades.length,
    };

    res.json({ message: "Backup snapshot restored", restored });
  } catch (error) {
    safeLogError("Restore failed", error);
    res.status(500).json({ message: "Restore failed" });
  }
});

app.use((req, res) => {
  res.status(404).json({ message: "Not found" });
});

app.use((error, _req, res, _next) => {
  safeLogError("Unhandled server error", error);
  res.status(500).json({ message: "Internal server error" });
});

const server = app.listen(PORT, async () => {
  console.info(`Server running on port ${PORT}`);

  try {
    await testConnection();
    await ensureApplicationSchema();
    console.info("MySQL Connected");
  } catch (error) {
    safeLogError("MySQL connection failed", error);
  }
});

module.exports = server;
