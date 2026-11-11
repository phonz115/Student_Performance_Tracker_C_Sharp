import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useNotifications } from '../../hooks/useNotifications';
import { getCourses } from '../../services/adminService';
import './AddGrades.css';

const GRADE_TERMS = [
  { key: 'prelim', label: 'Prelim' },
  { key: 'midterm', label: 'Midterm' },
  { key: 'finals', label: 'Finals' },
];

const getGradeTermKey = (term) => {
  const normalizedTerm = String(term || '').trim().toLowerCase();
  if (normalizedTerm.startsWith('prelim')) return 'prelim';
  if (normalizedTerm.includes('midterm')) return 'midterm';
  if (normalizedTerm.startsWith('final')) return 'finals';
  return null;
};
const getGradePeriodLabel = (period) => {
  const normalizedPeriod = String(period || '').trim().toLowerCase();
  if (normalizedPeriod.startsWith('prelim')) return 'Prelim';
  if (normalizedPeriod.includes('midterm')) return 'Midterm';
  if (normalizedPeriod.startsWith('final')) return 'Finals';
  return period || 'Prelim';
};

const getTeacherClassKey = (assignment) => getTeacherClassLabel(assignment).replace(/\s+/g, ' ').trim().toLowerCase();
const getTeacherClassLabel = (assignment) => (
  [assignment.subject, assignment.section || assignment.course].filter(Boolean).join(' · ') || 'Unassigned class'
);

const emptyForm = {
  studentId: '',
  subject: '',
  score: '',
  feedback: '',
  schoolYear: '2025-2026',
  semester: '1st Semester',
  term: 'Prelim',
};

const formatGradeValue = (grade) => Number(grade.score).toFixed(1) + (grade.teacherId ? '' : ' / 100');

const AddGrades = () => {
  const { user, users, grades, teacherAssignments, addGrade, editGrade, deleteGrade } = useAuth();
  const { success, error } = useNotifications();
  const students = useMemo(() => users.filter((account) => account.role === 'student'), [users]);
  const [courses, setCourses] = useState([]);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('All');
  const [isClassMenuOpen, setIsClassMenuOpen] = useState(false);
  const classFilterContainerRef = useRef(null);
  const classFilterTriggerRef = useRef(null);
  const classOptionRefs = useRef([]);
  const [semesterFilter, setSemesterFilter] = useState('All');
  const [schoolYearFilter, setSchoolYearFilter] = useState('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGrade, setEditingGrade] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const usesCollegeGradeScale = user.role === 'teacher' || Boolean(editingGrade?.teacherId);

  useEffect(() => {
    getCourses()
      .then(setCourses)
      .catch(() => setCourses([]));
  }, []);

  useEffect(() => {
    if (!isClassMenuOpen) return undefined;

    const closeOnPointerDown = (event) => {
      if (!classFilterContainerRef.current?.contains(event.target)) setIsClassMenuOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setIsClassMenuOpen(false);
        classFilterTriggerRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', closeOnPointerDown);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isClassMenuOpen]);

  const subjectOptions = useMemo(() => {
    const assignedSubjects = teacherAssignments
      .filter((assignment) => user.role !== 'teacher' || assignment.teacherId === user.id)
      .map((assignment) => assignment.subject)
      .filter(Boolean);
    const availableCourses = user.role === 'teacher'
      ? courses.filter((course) => course.teacherId === user.id || assignedSubjects.includes(course.name))
      : courses;

    return Array.from(new Set([...availableCourses.map((course) => course.name), ...assignedSubjects])).sort((a, b) => a.localeCompare(b));
  }, [courses, teacherAssignments, user.id, user.role]);

  const teacherAssignedRows = useMemo(() => new Set(
    teacherAssignments
      .filter((assignment) => assignment.teacherId === user.id)
      .map((assignment) => `${String(assignment.studentId)}|${assignment.subject}`),
  ), [teacherAssignments, user.id]);

  const teacherClassOptions = useMemo(() => {
    const options = new Map();
    teacherAssignments
      .filter((assignment) => assignment.teacherId === user.id)
      .forEach((assignment) => {
        const key = getTeacherClassKey(assignment);
        if (!options.has(key)) options.set(key, { key, label: getTeacherClassLabel(assignment) });
      });

    return [...options.values()].sort((left, right) => left.label.localeCompare(right.label));
  }, [teacherAssignments, user.id]);

  const selectedTeacherClassLabel = classFilter === 'All'
    ? 'All my classes'
    : teacherClassOptions.find((classOption) => classOption.key === classFilter)?.label || 'All my classes';

  const selectTeacherClass = (value) => {
    setClassFilter(value);
    setIsClassMenuOpen(false);
    classFilterTriggerRef.current?.focus();
  };

  const handleClassOptionKeyDown = (event, currentIndex) => {
    const optionCount = teacherClassOptions.length + 1;
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

    event.preventDefault();
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = (currentIndex + direction + optionCount) % optionCount;
    classOptionRefs.current[nextIndex]?.focus();
  };

  const availableStudents = useMemo(() => {
    if (user.role !== 'teacher') return students;

    return students.filter((student) => teacherAssignments.some((assignment) => (
      assignment.teacherId === user.id
      && String(assignment.studentId) === String(student.id)
      && (!form.subject || assignment.subject === form.subject || assignment.course === form.subject || assignment.section === form.subject)
    )));
  }, [form.subject, students, teacherAssignments, user.id, user.role]);

  const schoolYears = useMemo(() => {
    const gradeYears = grades
      .filter((grade) => (
        user.role !== 'teacher'
        || grade.teacherId === user.id
        || teacherAssignedRows.has(`${String(grade.studentId)}|${grade.subject}`)
      ))
      .map((grade) => grade.schoolYear || '2025-2026');
    const assignmentYears = user.role === 'teacher'
      ? teacherAssignments
        .filter((assignment) => assignment.teacherId === user.id)
        .map((assignment) => assignment.schoolYear || '2025-2026')
      : [];

    return Array.from(new Set([...gradeYears, ...assignmentYears]))
      .sort((left, right) => right.localeCompare(left));
  }, [grades, teacherAssignments, teacherAssignedRows, user.id, user.role]);
  const visibleGrades = useMemo(() => {
    const query = search.trim().toLowerCase();

    return grades.filter((grade) => {
      const student = students.find((account) => String(account.id) === String(grade.studentId));
      const mayView = user.role !== 'teacher'
        || grade.teacherId === user.id
        || teacherAssignedRows.has(`${String(grade.studentId)}|${grade.subject}`);
      const matchesSearch = !query || [student?.name, grade.studentId, grade.subject, grade.feedback]
        .some((value) => String(value || '').toLowerCase().includes(query));
      const matchesSemester = semesterFilter === 'All' || (grade.semester || '1st Semester') === semesterFilter;
      const matchesSchoolYear = schoolYearFilter === 'All' || (grade.schoolYear || '2025-2026') === schoolYearFilter;
      const matchesClass = user.role !== 'teacher' || classFilter === 'All' || teacherAssignments.some((assignment) => (
        assignment.teacherId === user.id
        && String(assignment.studentId) === String(grade.studentId)
        && assignment.subject === grade.subject
        && getTeacherClassKey(assignment) === classFilter
      ));

      return mayView && matchesSearch && matchesSemester && matchesSchoolYear && matchesClass;
    });
  }, [classFilter, grades, search, schoolYearFilter, semesterFilter, students, teacherAssignments, teacherAssignedRows, user.id, user.role]);

  const gradeGroups = useMemo(() => {
    const studentsById = new Map(students.map((student) => [String(student.id), student]));
    const groups = new Map();
    const query = search.trim().toLowerCase();

    const ensureGroup = ({ studentId: rawStudentId, subject: rawSubject, schoolYear: rawSchoolYear, semester: rawSemester }) => {
      const studentId = String(rawStudentId);
      const subject = rawSubject || 'Unassigned subject';
      const schoolYear = rawSchoolYear || '2025-2026';
      const semester = rawSemester || '1st Semester';
      const groupId = JSON.stringify([studentId, subject, schoolYear, semester]);

      if (!groups.has(groupId)) {
        groups.set(groupId, {
          id: groupId,
          studentId,
          studentName: studentsById.get(studentId)?.name || studentId,
          subject,
          schoolYear,
          semester,
          terms: {},
        });
      }

      return groups.get(groupId);
    };

    if (user.role === 'teacher') {
      teacherAssignments
        .filter((assignment) => assignment.teacherId === user.id)
        .filter((assignment) => classFilter === 'All' || getTeacherClassKey(assignment) === classFilter)
        .filter((assignment) => semesterFilter === 'All' || (assignment.semester || '1st Semester') === semesterFilter)
        .filter((assignment) => schoolYearFilter === 'All' || (assignment.schoolYear || '2025-2026') === schoolYearFilter)
        .filter((assignment) => {
          if (!query) return true;
          const student = studentsById.get(String(assignment.studentId));
          return [student?.name, assignment.studentId, assignment.subject, assignment.course, assignment.section]
            .some((value) => String(value || '').toLowerCase().includes(query));
        })
        .forEach((assignment) => ensureGroup({
          ...assignment,
          subject: assignment.subject || assignment.course,
        }));
    }

    visibleGrades.forEach((grade) => {
      const group = ensureGroup(grade);
      const termKey = getGradeTermKey(grade.term || 'Prelim');
      const currentTermGrade = termKey ? group.terms[termKey] : null;
      if (termKey && (!currentTermGrade || Number(grade.id) > Number(currentTermGrade.id))) {
        group.terms[termKey] = grade;
      }
    });

    return [...groups.values()].sort((left, right) => (
      left.studentName.localeCompare(right.studentName)
      || left.subject.localeCompare(right.subject)
      || left.schoolYear.localeCompare(right.schoolYear)
      || left.semester.localeCompare(right.semester)
    ));
  }, [classFilter, search, schoolYearFilter, semesterFilter, students, teacherAssignments, user.id, user.role, visibleGrades]);
  const openAddForm = (group = null, period = 'Prelim') => {
    setEditingGrade(null);
    setForm({
      ...emptyForm,
      studentId: group?.studentId || availableStudents[0]?.id || '',
      subject: group?.subject || subjectOptions[0] || '',
      schoolYear: group?.schoolYear || emptyForm.schoolYear,
      semester: group?.semester || emptyForm.semester,
      term: period,
    });
    setIsModalOpen(true);
  };

  const openEditForm = (grade) => {
    setEditingGrade(grade);
    setForm({
      studentId: grade.studentId,
      subject: grade.subject,
      score: String(grade.score),
      feedback: grade.feedback || '',
      schoolYear: grade.schoolYear || '2025-2026',
      semester: grade.semester || '1st Semester',
      term: getGradePeriodLabel(grade.term),
    });
    setIsModalOpen(true);
  };

  const closeForm = () => {
    if (isSaving) return;
    setIsModalOpen(false);
    setEditingGrade(null);
    setForm(emptyForm);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const score = Number(form.score);

    const minimumGrade = usesCollegeGradeScale ? 1 : 0;
    const maximumGrade = usesCollegeGradeScale ? 5 : 100;

    if (!Number.isFinite(score) || score < minimumGrade || score > maximumGrade) {
      error(usesCollegeGradeScale ? 'Grade must be between 1.0 and 5.0.' : 'Score must be between 0 and 100.');
      return;
    }

    try {
      setIsSaving(true);
      const gradeDetails = {
        subject: form.subject.trim(),
        score,
        feedback: form.feedback.trim(),
        schoolYear: form.schoolYear.trim(),
        semester: form.semester,
        term: form.term,
      };

      if (editingGrade) {
        await editGrade(editingGrade.id, gradeDetails);
        success('Grade updated.');
      } else {
        await addGrade({ ...gradeDetails, studentId: form.studentId });
        success('Grade added.');
      }

      setIsModalOpen(false);
      setEditingGrade(null);
    } catch (requestError) {
      error(requestError instanceof Error ? requestError.message : 'Grade could not be saved.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (grade) => {
    const studentName = students.find((student) => student.id === grade.studentId)?.name || grade.studentId;
    if (!window.confirm(`Delete the ${grade.subject} grade for ${studentName}?`)) return;

    try {
      await deleteGrade(grade.id);
      success('Grade deleted.');
    } catch (requestError) {
      error(requestError instanceof Error ? requestError.message : 'Grade could not be deleted.');
    }
  };

  return (
    <div className={user.role === 'teacher' ? 'grades-management-page teacher-grades-page' : 'grades-management-page'}>
      <header className="grades-management-header">
        <div>
          <h1>{user.role === 'admin' ? 'All grades' : 'Teacher grades'}</h1>
        </div>
        <button type="button" className="grades-add-btn" onClick={openAddForm}>Add grade</button>
      </header>

      <section className="grades-filter-bar" aria-label="Grade filters">
        <label>
          <span>Search</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Student, subject, or feedback" />
        </label>
        {user.role === 'teacher' && (
          <div
            className="teacher-class-filter"
            ref={classFilterContainerRef}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setIsClassMenuOpen(false);
            }}
          >
            <span id="teacher-class-filter-label">Class / section</span>
            <button
              type="button"
              className="teacher-class-trigger"
              ref={classFilterTriggerRef}
              aria-labelledby="teacher-class-filter-label teacher-class-filter-value"
              aria-haspopup="listbox"
              aria-expanded={isClassMenuOpen}
              aria-controls="teacher-class-filter-options"
              onClick={() => setIsClassMenuOpen((isOpen) => !isOpen)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setIsClassMenuOpen(true);
                  requestAnimationFrame(() => classOptionRefs.current[0]?.focus());
                }
              }}
            >
              <span id="teacher-class-filter-value">{selectedTeacherClassLabel}</span>
              <span className="teacher-class-chevron" aria-hidden="true" />
            </button>
            {isClassMenuOpen && (
              <div
                className="teacher-class-options"
                id="teacher-class-filter-options"
                role="listbox"
                aria-labelledby="teacher-class-filter-label"
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={classFilter === 'All'}
                  className={`teacher-class-option ${classFilter === 'All' ? 'selected' : ''}`.trim()}
                  ref={(element) => { classOptionRefs.current[0] = element; }}
                  onClick={() => selectTeacherClass('All')}
                  onKeyDown={(event) => handleClassOptionKeyDown(event, 0)}
                >
                  All my classes
                </button>
                {teacherClassOptions.map((classOption, index) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={classFilter === classOption.key}
                    className={`teacher-class-option ${classFilter === classOption.key ? 'selected' : ''}`.trim()}
                    key={classOption.key}
                    title={classOption.label}
                    ref={(element) => { classOptionRefs.current[index + 1] = element; }}
                    onClick={() => selectTeacherClass(classOption.key)}
                    onKeyDown={(event) => handleClassOptionKeyDown(event, index + 1)}
                  >
                    {classOption.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <label>
          <span>School year</span>
          <select value={schoolYearFilter} onChange={(event) => setSchoolYearFilter(event.target.value)}>
            <option value="All">All school years</option>
            {schoolYears.map((schoolYear) => <option value={schoolYear} key={schoolYear}>{schoolYear}</option>)}
          </select>
        </label>
        <label>
          <span>Semester</span>
          <select value={semesterFilter} onChange={(event) => setSemesterFilter(event.target.value)}>
            <option value="All">All semesters</option>
            <option>1st Semester</option>
            <option>2nd Semester</option>
            <option>Summer</option>
          </select>
        </label>
      </section>

      <section className="grades-table-card">
        <table className={user.role === 'teacher' ? 'grades-management-table teacher-grade-management-table' : 'grades-management-table'}>
          {user.role === 'teacher' ? (
            <>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Subject</th>
                  <th>School year</th>
                  <th>Semester</th>
                  {GRADE_TERMS.map(({ key, label }) => <th key={key}>{label}</th>)}
                </tr>
              </thead>
              <tbody>
                {gradeGroups.map((group) => (
                  <tr key={group.id}>
                    <td>{group.studentName}</td>
                    <td>{group.subject}</td>
                    <td>{group.schoolYear}</td>
                    <td>{group.semester}</td>
                    {GRADE_TERMS.map(({ key, label }) => {
                      const grade = group.terms[key];
                      const mayEdit = !grade || user.role === 'admin' || grade.teacherId === user.id;

                      return (
                        <td className="teacher-period-score" key={key}>
                          <div className="teacher-period-cell">
                            <strong>{grade ? formatGradeValue(grade) : '-'}</strong>
                            {mayEdit ? (
                              <div className="teacher-period-actions">
                                <button type="button" onClick={() => (grade ? openEditForm(grade) : openAddForm(group, label))}>
                                  {grade ? 'Edit' : 'Add'}
                                </button>
                                {grade && (
                                  <button type="button" className="delete" onClick={() => handleDelete(grade)}>Delete</button>
                                )}
                              </div>
                            ) : <span>View only</span>}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {gradeGroups.length === 0 && (
                  <tr><td colSpan={7} className="grades-empty">No grade records match your filters.</td></tr>
                )}
              </tbody>
            </>
          ) : (
            <>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Subject</th>
                  <th>Grade / Score</th>
                  <th>Grading period</th>
                  <th>Semester</th>
                  <th>Feedback</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleGrades.map((grade) => {
                  const student = students.find((account) => account.id === grade.studentId);
                  const mayEdit = user.role === 'admin' || grade.teacherId === user.id;

                  return (
                    <tr key={grade.id}>
                      <td>{student?.name || grade.studentId}</td>
                      <td>{grade.subject}</td>
                      <td>{formatGradeValue(grade)}</td>
                      <td>{getGradePeriodLabel(grade.term)}</td>
                      <td>{grade.semester || '1st Semester'}</td>
                      <td>{grade.feedback || '—'}</td>
                      <td className="grade-row-actions">
                        {mayEdit ? (
                          <>
                            <button type="button" onClick={() => openEditForm(grade)}>Edit</button>
                            <button type="button" className="delete" onClick={() => handleDelete(grade)}>Delete</button>
                          </>
                        ) : <span>View only</span>}
                      </td>
                    </tr>
                  );
                })}
                {visibleGrades.length === 0 && (
                  <tr><td colSpan="7" className="grades-empty">No grade records match your search.</td></tr>
                )}
              </tbody>
            </>
          )}
        </table>
      </section>

      {isModalOpen && (
        <div className="add-grades-overlay" role="presentation">
          <form className="add-grades-modal" onSubmit={handleSubmit} role="dialog" aria-modal="true" aria-labelledby="add-grades-title" aria-busy={isSaving}>
            <header className="add-grades-modal-header">
              <div>
                <p className="grades-page-kicker">Grade record</p>
                <h2 id="add-grades-title">{editingGrade ? 'Edit grade' : 'Add grade'}</h2>
              </div>
              <button type="button" aria-label="Close grade form" onClick={closeForm}>×</button>
            </header>

            {!editingGrade && (
              <label className="add-grades-field">
                <span>Student</span>
                <select value={form.studentId} onChange={(event) => setForm((current) => ({ ...current, studentId: event.target.value }))} required>
                  {availableStudents.length === 0 && <option value="">No assigned students</option>}
                  {availableStudents.map((student) => <option key={student.id} value={student.id}>{student.name} ({student.id})</option>)}
                </select>
              </label>
            )}

            <label className="add-grades-field">
              <span>Subject</span>
              <select value={form.subject} onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))} required>
                {subjectOptions.length === 0 && <option value="">No courses available</option>}
                {subjectOptions.map((subject) => <option key={subject}>{subject}</option>)}
              </select>
            </label>

            <label className="add-grades-field">
              <span>{usesCollegeGradeScale ? 'Grade (1.0 = highest, 5.0 = lowest)' : 'Score (0 to 100)'}</span>
              <input type="number" min={usesCollegeGradeScale ? 1 : 0} max={usesCollegeGradeScale ? 5 : 100} step="0.1" value={form.score} onChange={(event) => setForm((current) => ({ ...current, score: event.target.value }))} required />
            </label>

            <label className="add-grades-field">
              <span>Feedback</span>
              <textarea maxLength="500" rows="3" value={form.feedback} onChange={(event) => setForm((current) => ({ ...current, feedback: event.target.value }))} />
            </label>

            <div className="add-grades-form-row">
              <label className="add-grades-field">
                <span>School year</span>
                <input value={form.schoolYear} onChange={(event) => setForm((current) => ({ ...current, schoolYear: event.target.value }))} required />
              </label>
              <label className="add-grades-field">
                <span>Semester</span>
                <select value={form.semester} onChange={(event) => setForm((current) => ({ ...current, semester: event.target.value }))}>
                  <option>1st Semester</option>
                  <option>2nd Semester</option>
                  <option>Summer</option>
                </select>
              </label>
              <label className="add-grades-field">
                <span>Grading period</span>
                <select value={form.term} onChange={(event) => setForm((current) => ({ ...current, term: event.target.value }))}>
                  <option>Prelim</option>
                  <option>Midterm</option>
                  <option>Finals</option>
                </select>
              </label>
            </div>

            <footer className="add-grades-modal-actions">
              <button type="button" className="secondary" onClick={closeForm} disabled={isSaving}>Cancel</button>
              <button type="submit" disabled={isSaving || !form.subject || (!editingGrade && !form.studentId)}>{isSaving ? 'Saving…' : 'Save grade'}</button>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
};

export default AddGrades;
