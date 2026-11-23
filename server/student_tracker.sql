CREATE DATABASE IF NOT EXISTS student_tracker;

USE student_tracker;

CREATE TABLE IF NOT EXISTS users (
  id        VARCHAR(40)  PRIMARY KEY,
  email     VARCHAR(100) NOT NULL UNIQUE,
  firstname VARCHAR(100),
  lastname  VARCHAR(100),
  name      VARCHAR(180),
  role      VARCHAR(20)  NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
  password  VARCHAR(255) NOT NULL,
  course    VARCHAR(100) NOT NULL DEFAULT '',
  school_year VARCHAR(20) NOT NULL DEFAULT '2025-2026',
  semester  VARCHAR(40) NOT NULL DEFAULT '1st Semester',
  is_deleted TINYINT(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash CHAR(64) PRIMARY KEY,
  user_id    VARCHAR(40) NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  INDEX idx_password_reset_user_id (user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS subjects (
  subject_id   INT AUTO_INCREMENT PRIMARY KEY,
  subject_name VARCHAR(100) NOT NULL,
  teacher_id   VARCHAR(40),
  is_deleted   TINYINT(1) NOT NULL DEFAULT 0,
  FOREIGN KEY (teacher_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS courses (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(40)  NOT NULL UNIQUE,
  name        VARCHAR(120) NOT NULL,
  description VARCHAR(255) DEFAULT '',
  school_year VARCHAR(20)  NOT NULL DEFAULT '2025-2026',
  semester    VARCHAR(40)  NOT NULL DEFAULT '1st Semester',
  teacher_id  VARCHAR(40),
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_deleted  TINYINT(1) NOT NULL DEFAULT 0,
  FOREIGN KEY (teacher_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS teacher_assignments (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  teacher_id  VARCHAR(40)  NOT NULL,
  student_id  VARCHAR(40)  NOT NULL,
  subject     VARCHAR(100) NOT NULL,
  course      VARCHAR(100) DEFAULT '',
  section     VARCHAR(50)  DEFAULT '',
  school_year VARCHAR(20)  NOT NULL DEFAULT '2025-2026',
  semester    VARCHAR(40)  NOT NULL DEFAULT '1st Semester',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_deleted  TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY unique_teacher_assignment (teacher_id, student_id, subject, school_year, semester),
  FOREIGN KEY (teacher_id) REFERENCES users(id),
  FOREIGN KEY (student_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS grades (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  student_id  VARCHAR(40) NOT NULL,
  subject_id  INT,
  subject     VARCHAR(100),
  teacher_id  VARCHAR(40),
  score       DECIMAL(5,2) NOT NULL,
  feedback    TEXT,
  school_year VARCHAR(20) NOT NULL DEFAULT '2025-2026',
  semester    VARCHAR(40) NOT NULL DEFAULT '1st Semester',
  term        VARCHAR(40) NOT NULL DEFAULT 'Prelim',
  is_deleted  TINYINT(1) NOT NULL DEFAULT 0,
  FOREIGN KEY (student_id) REFERENCES users(id),
  FOREIGN KEY (subject_id) REFERENCES subjects(subject_id),
  FOREIGN KEY (teacher_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- Backfill soft-delete columns for databases created before the repository/service refactor.
SET @student_tracker_sql = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'is_deleted') = 0, 'ALTER TABLE users ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE student_tracker_stmt FROM @student_tracker_sql; EXECUTE student_tracker_stmt; DEALLOCATE PREPARE student_tracker_stmt;
SET @student_tracker_sql = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'password_reset_tokens' AND COLUMN_NAME = 'is_deleted') = 0, 'ALTER TABLE password_reset_tokens ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE student_tracker_stmt FROM @student_tracker_sql; EXECUTE student_tracker_stmt; DEALLOCATE PREPARE student_tracker_stmt;
SET @student_tracker_sql = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subjects' AND COLUMN_NAME = 'is_deleted') = 0, 'ALTER TABLE subjects ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE student_tracker_stmt FROM @student_tracker_sql; EXECUTE student_tracker_stmt; DEALLOCATE PREPARE student_tracker_stmt;
SET @student_tracker_sql = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'courses' AND COLUMN_NAME = 'is_deleted') = 0, 'ALTER TABLE courses ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE student_tracker_stmt FROM @student_tracker_sql; EXECUTE student_tracker_stmt; DEALLOCATE PREPARE student_tracker_stmt;
SET @student_tracker_sql = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'teacher_assignments' AND COLUMN_NAME = 'is_deleted') = 0, 'ALTER TABLE teacher_assignments ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE student_tracker_stmt FROM @student_tracker_sql; EXECUTE student_tracker_stmt; DEALLOCATE PREPARE student_tracker_stmt;
SET @student_tracker_sql = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'grades' AND COLUMN_NAME = 'is_deleted') = 0, 'ALTER TABLE grades ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE student_tracker_stmt FROM @student_tracker_sql; EXECUTE student_tracker_stmt; DEALLOCATE PREPARE student_tracker_stmt;

INSERT INTO users (id, email, firstname, lastname, name, role, password) VALUES
('1001', 'admin@school.com', 'System', 'Admin', 'System Admin', 'admin', 'p2$120000$g-FwUFfeObgjSZKigpCeoQ$xvqD_slXCVyxFpVxgbGWx30aPNtXztkNLDcTxioPolc'),
('2001', 'teacher@school.com', 'Juan', 'Dela Cruz', 'Juan Dela Cruz', 'teacher', 'p2$120000$JHsHWYbNFyNfw8QiCjxgIQ$jkhrmkxHY9fKv3gMahcYvYzpcRUq4o591p9WvmYfhEE'),
('3001', 'student@school.com', 'John', 'Doe', 'John Doe', 'student', 'p2$120000$H6zPYan07cyqNOLwtF7-og$BTiltGHykxvl6DuSraw8ZsSd_tDtYlUcQVQmxlrtPuo')
ON DUPLICATE KEY UPDATE email = VALUES(email), firstname = VALUES(firstname),
  lastname = VALUES(lastname), name = VALUES(name), role = VALUES(role);

INSERT INTO subjects (subject_name, teacher_id) VALUES
('Mathematics', '2001'),
('Science', '2001');

INSERT INTO courses (code, name, description, teacher_id) VALUES
('MATH10', 'Mathematics 10', 'Core mathematics course', '2001'),
('SCI10', 'Science 10', 'Core science course', '2001')
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), teacher_id = VALUES(teacher_id);

INSERT INTO teacher_assignments (teacher_id, student_id, subject, course, section, school_year, semester) VALUES
('2001', '3001', 'Mathematics', 'MATH10', 'Section A', '2025-2026', '1st Semester'),
('2001', '3001', 'Science', 'SCI10', 'Section A', '2025-2026', '1st Semester')
ON DUPLICATE KEY UPDATE course = VALUES(course), section = VALUES(section);

INSERT INTO grades (student_id, subject_id, subject, teacher_id, score, feedback, school_year, semester, term) VALUES
('3001', 1, 'Mathematics', '2001', 85.00, 'Excellent work on problem solving.', '2025-2026', '1st Semester', 'Prelim'),
('3001', 2, 'Science', '2001', 92.00, 'Consistent performance and strong lab output.', '2025-2026', '1st Semester', 'Midterm');
