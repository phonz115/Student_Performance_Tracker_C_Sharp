import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useStatusToast } from '../../hooks/useNotifications';
import { formatName } from '../../utils/formatName';
import {
  createCourse,
  createTeacherAssignment,
  createUser,
  deleteCourse,
  deleteTeacherAssignment,
  deleteUser,
  getCourses,
  getTeacherAssignments,
  resetUserPassword,
  updateCourse,
  updateUser,
} from '../../services/adminService';
import './ManageUsers.css';

const emptyUserForm = {
  id: '',
  firstName: '',
  lastName: '',
  name: '',
  email: '',
  role: 'student',
  course: 'BSIT',
  semester: '1st Semester',
  schoolYear: '2025-2026',
  password: '',
};
const emptyResetPasswordForm = { password: '', confirmPassword: '' };
const emptyCourseForm = { code: '', name: '', description: '', semester: '1st Semester', schoolYear: '2025-2026', teacherId: '' };
const studentProgramOptions = ['BSIT', 'BSCS', 'BSEMC'];
const usersPerPage = 4;
const coursesPerPage = 5;

const roleLabel = (role = '') => role.charAt(0).toUpperCase() + role.slice(1);
const rolePluralLabel = (role = '') => ({ teacher: 'Teachers', student: 'Students', admin: 'Admins' }[role] || 'Users');

const splitName = (name = '') => {
  const parts = formatName(name).split(' ').filter(Boolean);

  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ') || '',
  };
};

const composeName = (form) => {
  return `${form.firstName || ''} ${form.lastName || ''}`.trim() || form.name;
};

const getCourseAssignmentKey = (course) => {
  return `${course.teacherId || ''}|${course.name || ''}|${course.schoolYear || '2025-2026'}|${course.semester || '1st Semester'}`;
};

const getTeacherAssignmentKey = (assignment) => {
  return `${assignment.teacherId || ''}|${assignment.subject || ''}|${assignment.schoolYear || '2025-2026'}|${assignment.semester || '1st Semester'}`;
};

const normalizeComparableText = (value = '') => String(value || '').trim().toLowerCase();

const getCourseValidationMessage = ({ courseForm, courses, editingCourseId }) => {
  const code = String(courseForm.code || '').trim().toUpperCase();
  const name = String(courseForm.name || '').trim();

  if (!name || !code) {
    return 'Course name and course code are required.';
  }

  const duplicateCode = courses.find((course) => String(course.id || '') !== String(editingCourseId || '')
    && String(course.code || '').trim().toUpperCase() === code);

  if (duplicateCode) {
    return `Duplicate course code "${code}" is not allowed.`;
  }

  const duplicateCourse = courses.find((course) => String(course.id || '') !== String(editingCourseId || '')
    && normalizeComparableText(course.name) === normalizeComparableText(name)
    && normalizeComparableText(course.semester || '1st Semester') === normalizeComparableText(courseForm.semester || '1st Semester')
    && normalizeComparableText(course.schoolYear || '2025-2026') === normalizeComparableText(courseForm.schoolYear || '2025-2026'));

  if (duplicateCourse) {
    return `Duplicate course title "${name}" for this term is not allowed.`;
  }

  return '';
};

const IconButton = ({ label, className = '', children, onClick, disabled = false }) => (
  <button type="button" className={`users-icon-btn ${className}`.trim()} aria-label={label} title={label} onClick={onClick} disabled={disabled}>
    {children}
  </button>
);

const CourseCatalog = ({
  courses,
  teachers,
  searchQuery,
  setSearchQuery,
  currentPage,
  setCurrentPage,
  openCreateCourse,
  onEditCourse,
  onDeleteCourse,
  isSaving,
}) => {
  const teacherMap = useMemo(() => {
    return usersToMap(teachers);
  }, [teachers]);
  const courseRows = useMemo(() => {
    return courses.map((course) => ({
      ...course,
      teacherName: course.teacherId ? teacherMap.get(course.teacherId) || course.teacherId : 'Unassigned',
    }));
  }, [courses, teacherMap]);
  const filteredCourses = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return courseRows.filter((course) => {
      const matchesQuery = !query || [course.code, course.name, course.description, course.teacherName]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(query));

      return matchesQuery;
    });
  }, [courseRows, searchQuery]);
  const totalPages = Math.max(1, Math.ceil(filteredCourses.length / coursesPerPage));
  const pageCourses = filteredCourses.slice((currentPage - 1) * coursesPerPage, currentPage * coursesPerPage);
  const pageStart = filteredCourses.length === 0 ? 0 : (currentPage - 1) * coursesPerPage + 1;
  const pageEnd = Math.min(currentPage * coursesPerPage, filteredCourses.length);

  return (
    <section id="courses" className="course-catalog-panel">
      <div className="course-catalog-header">
        <h1>Course Catalog</h1>
        <button type="button" className="course-create-btn" onClick={openCreateCourse} disabled={isSaving}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Create Course
        </button>
      </div>


      <div className="course-filter-bar">
        <label className="course-search">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m21 21-4.35-4.35" />
            <circle cx="11" cy="11" r="7" />
          </svg>
          <input
            type="search"
            placeholder="Filter by course name or code..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>
      </div>

      <div className="course-table-card">
        <table className="course-table">
          <thead>
            <tr>
              <th>Course</th>
              <th>Description</th>
              <th>Semester</th>
              <th>Offer Code</th>
              <th>School Year</th>
              <th>Teacher Lead</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageCourses.map((course) => (
              <tr key={course.id || course.code}>
                <td>{course.name}</td>
                <td>{course.description || '—'}</td>
                <td>{course.semester || 'Not set'}</td>
                <td>{course.code}</td>
                <td>{course.schoolYear || 'Not set'}</td>
                <td className={course.teacherId ? '' : 'muted'}>{course.teacherName}</td>
                <td>
                  <span className="users-action-cell">
                    <IconButton label={`Edit ${course.name}`} onClick={() => onEditCourse(course)} disabled={isSaving}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                      </svg>
                    </IconButton>
                    <IconButton label={`Delete ${course.name}`} className="delete" onClick={() => onDeleteCourse(course)} disabled={isSaving}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M3 6h18" />
                        <path d="M8 6V4h8v2" />
                        <path d="M19 6l-1 15H6L5 6" />
                        <path d="M10 11v6M14 11v6" />
                      </svg>
                    </IconButton>
                  </span>
                </td>
              </tr>
            ))}
            {pageCourses.length === 0 && (
              <tr>
                <td colSpan="7" className="users-empty">No courses match your search.</td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="users-pagination">
          <span>Showing {pageStart} to {pageEnd} of {filteredCourses.length} courses</span>
          <div>
            <button type="button" aria-label="Previous page" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
              <button key={page} type="button" className={page === currentPage ? 'active' : ''} onClick={() => setCurrentPage(page)}>
                {page}
              </button>
            ))}
            <button type="button" aria-label="Next page" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

const usersToMap = (accounts) => {
  return new Map(accounts.map((account) => [account.id, formatName(account.name)]));
};

const loadAdminRequest = async (label, request, fallback) => {
  try {
    return { label, data: await request(), failed: false };
  } catch (error) {
    return { label, data: fallback, failed: true, message: error instanceof Error ? error.message : 'Request failed' };
  }
};

const ManageUsers = () => {
  const { users, reloadData } = useAuth();
  const location = useLocation();
  const [userForm, setUserForm] = useState(emptyUserForm);
  const [editingUserId, setEditingUserId] = useState('');
  const [selectedCourseIds, setSelectedCourseIds] = useState([]);
  const [editingCourseId, setEditingCourseId] = useState('');
  const [isUserFormOpen, setIsUserFormOpen] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState(null);
  const [resetPasswordForm, setResetPasswordForm] = useState(emptyResetPasswordForm);
  const [resetPasswordError, setResetPasswordError] = useState('');
  const [isCourseFormOpen, setIsCourseFormOpen] = useState(false);
  const [roleFilter, setRoleFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [courseSearchQuery, setCourseSearchQuery] = useState('');
  const [courseCurrentPage, setCourseCurrentPage] = useState(1);
  const [courseForm, setCourseForm] = useState(emptyCourseForm);
  const [assignments, setAssignments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  useStatusToast(successMessage, 'success', 'Admin update');
  useStatusToast(errorMessage, 'error', 'Admin issue');
  useStatusToast(resetPasswordError, 'error', 'Password reset issue');

  const teachers = users.filter((user) => user.role === 'teacher');
  const roleFromHash = ({ '#teachers': 'teacher', '#students': 'student', '#admins': 'admin' })[location.hash] || null;
  const displayedRole = roleFromHash || roleFilter;
  const filteredUsers = useMemo(() => {
    return users.filter((account) => displayedRole === 'all' || account.role === displayedRole);
  }, [displayedRole, users]);
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / usersPerPage));
  const pageUsers = filteredUsers.slice((currentPage - 1) * usersPerPage, currentPage * usersPerPage);
  const editingUser = editingUserId ? users.find((account) => account.id === editingUserId) : null;
  const programOptions = studentProgramOptions;
  const assignableCourses = courses.filter((course) => course.id);
  const activeAdminView = location.hash === '#courses' ? 'courses' : 'users';

  const loadAdminData = async () => {
    const [assignmentResult, courseResult] = await Promise.all([
      loadAdminRequest('teacher assignments', getTeacherAssignments, []),
      loadAdminRequest('courses', getCourses, []),
    ]);

    setAssignments(assignmentResult.data);
    setCourses(courseResult.data);

    const failedRequests = [assignmentResult, courseResult].filter((result) => result.failed);

    if (failedRequests.length > 0) {
      throw new Error(`Could not load admin ${failedRequests.map((result) => result.label).join(', ')}. Restart the server if this is a new database/schema change.`);
    }
  };

  useEffect(() => {
    loadAdminData().catch((error) => setErrorMessage(error instanceof Error ? error.message : 'Some admin data could not be loaded.'));
  }, []);

  useEffect(() => {
    const roleByHash = ({ '#teachers': 'teacher', '#students': 'student', '#admins': 'admin' })[location.hash] || 'all';
    setRoleFilter(roleByHash);
  }, [location.hash]);

  useEffect(() => {
    setCurrentPage(1);
  }, [roleFilter, users.length]);

  useEffect(() => {
    setCourseCurrentPage(1);
  }, [courseSearchQuery, courses.length]);

  useEffect(() => {
    const scrollToHash = () => {
      const sectionId = window.location.hash.replace('#', '');

      if (!sectionId) {
        return;
      }

      window.setTimeout(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 0);
    };

    scrollToHash();
    window.addEventListener('hashchange', scrollToHash);

    return () => window.removeEventListener('hashchange', scrollToHash);
  }, []);

  const runAdminAction = async (action, success) => {
    try {
      setIsSaving(true);
      setErrorMessage('');
      setSuccessMessage('');
      await action();
      await Promise.all([reloadData(), loadAdminData()]);
      setSuccessMessage(success);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Admin action failed.');
    } finally {
      setIsSaving(false);
    }
  };

  const openCreateUser = (role = 'student') => {
    setEditingUserId('');
    setSelectedCourseIds([]);
    setUserForm({ ...emptyUserForm, role });
    setIsUserFormOpen(true);
  };

  const openCreateCourse = () => {
    setEditingCourseId('');
    setCourseForm(emptyCourseForm);
    setIsCourseFormOpen(true);
  };

  const handleEditCourse = (course) => {
    setEditingCourseId(String(course.id));
    setCourseForm({
      code: course.code || '',
      name: course.name || '',
      description: course.description || '',
      semester: course.semester || '1st Semester',
      schoolYear: course.schoolYear || '2025-2026',
      teacherId: course.teacherId || '',
    });
    setIsCourseFormOpen(true);
  };

  const closeCourseForm = () => {
    if (isSaving) {
      return;
    }

    setEditingCourseId('');
    setCourseForm(emptyCourseForm);
    setIsCourseFormOpen(false);
  };

  const closeUserForm = () => {
    if (isSaving) {
      return;
    }

    setEditingUserId('');
    setSelectedCourseIds([]);
    setUserForm(emptyUserForm);
    setIsUserFormOpen(false);
  };

  const closeResetPasswordForm = () => {
    if (isSaving) {
      return;
    }

    setResetPasswordUser(null);
    setResetPasswordForm(emptyResetPasswordForm);
    setResetPasswordError('');
  };

  const handleSubmitUser = (event) => {
    event.preventDefault();
    const userPayload = {
      ...userForm,
      name: composeName(userForm),
      email: userForm.email || `${userForm.id || userForm.firstName || 'user'}@classiq.local`.toLowerCase().replace(/\s+/g, ''),
      course: ['student', 'teacher'].includes(userForm.role) ? userForm.course : '',
    };

    runAdminAction(async () => {
      const shouldSyncCourseAssignments = Boolean(editingUserId && userPayload.role === 'student');

      if (editingUserId) {
        await updateUser(editingUserId, {
          name: userPayload.name,
          email: userPayload.email,
          role: userPayload.role,
          course: ['student', 'teacher'].includes(userPayload.role) ? userPayload.course : '',
          semester: userPayload.semester,
          schoolYear: userPayload.schoolYear,
        });
      } else {
        await createUser(userPayload);
      }

      if (shouldSyncCourseAssignments) {
        const selectedIdSet = new Set(selectedCourseIds.map(String));
        const selectedCourses = courses.filter((course) => course.id && course.teacherId && selectedIdSet.has(String(course.id)));
        const selectedAssignmentKeys = new Set(selectedCourses.map(getCourseAssignmentKey));
        const catalogAssignmentKeys = new Set(courses.filter((course) => course.teacherId).map(getCourseAssignmentKey));
        const existingStudentAssignments = assignments.filter((assignment) => assignment.studentId === editingUserId);
        const assignmentsToRemove = existingStudentAssignments.filter((assignment) => (
          assignment.id
          && catalogAssignmentKeys.has(getTeacherAssignmentKey(assignment))
          && !selectedAssignmentKeys.has(getTeacherAssignmentKey(assignment))
        ));

        await Promise.all([
          ...assignmentsToRemove.map((assignment) => deleteTeacherAssignment(assignment.id)),
          ...selectedCourses.map((course) => createTeacherAssignment({
            teacherId: course.teacherId,
            studentId: editingUserId,
            subject: course.name,
            course: userPayload.course,
            section: course.code,
            schoolYear: course.schoolYear || userPayload.schoolYear,
            semester: course.semester || userPayload.semester,
          })),
        ]);
      }

      setUserForm(emptyUserForm);
      setEditingUserId('');
      setSelectedCourseIds([]);
      setIsUserFormOpen(false);
    }, editingUserId ? 'User updated successfully.' : 'User created successfully.');
  };

  const handleEditUser = (currentUser) => {
    const nameParts = splitName(currentUser.name);
    const assignment = assignments.find((item) => item.teacherId === currentUser.id || item.studentId === currentUser.id);
    const studentAssignmentKeys = new Set(
      assignments
        .filter((item) => item.studentId === currentUser.id)
        .map(getTeacherAssignmentKey)
    );

    setEditingUserId(currentUser.id);
    setSelectedCourseIds(
      courses
        .filter((course) => course.id && studentAssignmentKeys.has(getCourseAssignmentKey(course)))
        .map((course) => String(course.id))
    );
    setUserForm({
      ...emptyUserForm,
      id: currentUser.id,
      name: formatName(currentUser.name),
      firstName: nameParts.firstName,
      lastName: nameParts.lastName,
      email: currentUser.email,
      role: currentUser.role,
      course: programOptions.includes(currentUser.course) ? currentUser.course : programOptions[0],
      semester: currentUser.semester || assignment?.semester || '1st Semester',
      schoolYear: currentUser.schoolYear || assignment?.schoolYear || '2025-2026',
      password: '',
    });
    setIsUserFormOpen(true);
  };

  const handleDeleteUser = (currentUser) => {
    if (!window.confirm(`Delete ${currentUser.name}? This removes linked assignments and student grades.`)) {
      return;
    }

    runAdminAction(() => deleteUser(currentUser.id), 'User deleted successfully.');
  };

  const handleResetPassword = (currentUser) => {
    setResetPasswordUser(currentUser);
    setResetPasswordForm(emptyResetPasswordForm);
    setResetPasswordError('');
  };

  const handleSubmitResetPassword = (event) => {
    event.preventDefault();

    if (!resetPasswordUser) {
      return;
    }

    if (resetPasswordForm.password !== resetPasswordForm.confirmPassword) {
      setResetPasswordError('Passwords do not match.');
      return;
    }

    runAdminAction(async () => {
      await resetUserPassword(resetPasswordUser.id, resetPasswordForm.password);
      setResetPasswordUser(null);
      setResetPasswordForm(emptyResetPasswordForm);
      setResetPasswordError('');
    }, 'Password reset successfully.');
  };

  const handleSubmitCourse = (event) => {
    event.preventDefault();
    const coursePayload = {
      ...courseForm,
      code: String(courseForm.code || '').trim().toUpperCase(),
      name: String(courseForm.name || '').trim(),
      description: String(courseForm.description || '').trim(),
      schoolYear: String(courseForm.schoolYear || '').trim() || '2025-2026',
      semester: courseForm.semester || '1st Semester',
      teacherId: courseForm.teacherId || '',
    };
    const validationMessage = getCourseValidationMessage({
      courseForm: coursePayload,
      courses,
      editingCourseId,
    });

    if (validationMessage) {
      setSuccessMessage('');
      setErrorMessage(validationMessage);
      return;
    }

    runAdminAction(async () => {
      if (editingCourseId) {
        await updateCourse(Number(editingCourseId), coursePayload);
      } else {
        await createCourse(coursePayload);
      }

      setCourseForm(emptyCourseForm);
      setEditingCourseId('');
      setIsCourseFormOpen(false);
    }, editingCourseId ? 'Course updated successfully.' : 'Course created successfully.');
  };

  const handleDeleteCourse = (course) => {
    if (!course.id) {
      setSuccessMessage('');
      setErrorMessage('This course cannot be deleted because it has no course ID.');
      return;
    }

    if (!window.confirm(`Delete ${course.name}? This removes the course from the catalog.`)) {
      return;
    }

    runAdminAction(() => deleteCourse(course.id), 'Course deleted successfully.');
  };

  const updateForm = (setter) => (event) => {
    const { name, value } = event.target;
    setter((currentForm) => ({ ...currentForm, [name]: value }));
  };

  const pageStart = filteredUsers.length === 0 ? 0 : (currentPage - 1) * usersPerPage + 1;
  const pageEnd = Math.min(currentPage * usersPerPage, filteredUsers.length);

  return (
    <div className="manage-users-page">
      {activeAdminView === 'courses' && (
        <CourseCatalog
          courses={courses}
          teachers={teachers}
          searchQuery={courseSearchQuery}
          setSearchQuery={setCourseSearchQuery}
          currentPage={courseCurrentPage}
          setCurrentPage={setCourseCurrentPage}
          openCreateCourse={openCreateCourse}
          onEditCourse={handleEditCourse}
          onDeleteCourse={handleDeleteCourse}
          isSaving={isSaving}
        />
      )}

      {activeAdminView === 'users' && (
        <section id={roleFromHash || 'users'} className="users-panel">
          <div className="users-page-header">
            <h1>{rolePluralLabel(displayedRole)}</h1>
            <div className="users-page-actions">
              {!roleFromHash && (
                <select value={roleFilter} aria-label="Filter users by role" onChange={(event) => setRoleFilter(event.target.value)}>
                  <option value="all">All Roles</option>
                  <option value="student">Students</option>
                  <option value="teacher">Teachers</option>
                  <option value="admin">Admins</option>
                </select>
              )}
              <button type="button" className="users-primary-btn" onClick={() => openCreateUser(displayedRole === 'all' ? 'student' : displayedRole)} disabled={isSaving}>
                + Add {displayedRole === 'all' ? 'User' : roleLabel(displayedRole)}
              </button>
            </div>
          </div>

          <div className="users-table-card">
            <table className="users-table">
              <thead>
                <tr>
                  {displayedRole === 'all' ? (
                    <>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Actions</th>
                    </>
                  ) : (
                    <>
                      <th>ID Number</th>
                      <th>First Name</th>
                      <th>Last Name</th>
                      <th>Email</th>
                      {(displayedRole === 'teacher' || displayedRole === 'student') && <th>Program</th>}
                      <th>School Year</th>
                      <th>Actions</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {pageUsers.map((currentUser) => {
                  const displayName = formatName(currentUser.name);
                  const nameParts = splitName(currentUser.name);
                  const actions = (
                    <span className="users-action-cell">
                      <IconButton label={`Edit ${displayName}`} onClick={() => handleEditUser(currentUser)} disabled={isSaving}>
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                        </svg>
                      </IconButton>
                      <IconButton label={`Reset password for ${displayName}`} className="reset" onClick={() => handleResetPassword(currentUser)} disabled={isSaving}>
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M15 7a4 4 0 1 0-3.4 4" />
                          <path d="M12 11h9l-2 2 2 2" />
                        </svg>
                      </IconButton>
                      <IconButton label={`Delete ${displayName}`} className="delete" onClick={() => handleDeleteUser(currentUser)} disabled={isSaving}>
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M3 6h18" />
                          <path d="M8 6V4h8v2" />
                          <path d="M19 6l-1 15H6L5 6" />
                          <path d="M10 11v6M14 11v6" />
                        </svg>
                      </IconButton>
                    </span>
                  );

                  if (displayedRole === 'all') {
                    return (
                      <tr key={currentUser.id}>
                        <td>
                          <span className="users-name-cell">
                            <span>
                              <strong>{displayName}</strong>
                              <small>{currentUser.email}</small>
                            </span>
                          </span>
                        </td>
                        <td>{roleLabel(currentUser.role)}</td>
                        <td>{actions}</td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={currentUser.id}>
                      <td>{currentUser.id}</td>
                      <td>{nameParts.firstName}</td>
                      <td>{nameParts.lastName || 'Not set'}</td>
                      <td>{currentUser.email}</td>
                      {(displayedRole === 'teacher' || displayedRole === 'student') && <td>{currentUser.course || 'Not set'}</td>}
                      <td>{currentUser.schoolYear || 'Not set'}</td>
                      <td>{actions}</td>
                    </tr>
                  );
                })}
                {pageUsers.length === 0 && (
                  <tr>
                    <td colSpan={displayedRole === 'all' ? 3 : (displayedRole === 'teacher' || displayedRole === 'student' ? 7 : 6)} className="users-empty">
                      {displayedRole === 'all'
                        ? 'No users match this filter.'
                        : `No ${rolePluralLabel(displayedRole).toLowerCase()} yet. Add the first ${displayedRole} to get started.`}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="users-pagination">
              <span>Showing {pageStart} to {pageEnd} of {filteredUsers.length} {displayedRole === 'all' ? 'entries' : rolePluralLabel(displayedRole).toLowerCase()}</span>
              <div>
                <button type="button" aria-label="Previous page" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                </button>
                {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                  <button key={page} type="button" className={page === currentPage ? 'active' : ''} onClick={() => setCurrentPage(page)}>
                    {page}
                  </button>
                ))}
                <button type="button" aria-label="Next page" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {isUserFormOpen && (
        <div className="users-modal-overlay" role="presentation">
          <form className={`users-modal user-form-modal ${editingUserId ? 'edit-user-modal' : 'add-user-modal'}`} onSubmit={handleSubmitUser} role="dialog" aria-modal="true" aria-labelledby="users-modal-title" autoComplete="off">
            <span className="users-modal-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
                {!editingUserId && <path d="M19 8v6M16 11h6" />}
              </svg>
            </span>
            <h2 id="users-modal-title">{editingUserId ? `Edit ${roleLabel(userForm.role)}` : `Add ${roleLabel(userForm.role)}`}</h2>

            <div className="users-form-grid users-form-grid-two">
              <label>
                <span>Email</span>
                <input name="email" type="email" placeholder="e.g. user@classiq.local" value={userForm.email} onChange={updateForm(setUserForm)} autoComplete="email" required />
              </label>
              <label>
                <span>ID Number</span>
                {editingUserId ? (
                  <input value={editingUserId} readOnly aria-label="ID Number" />
                ) : (
                  <input name="id" type="text" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} title="Enter exactly 6 digits." placeholder="e.g. 123456" value={userForm.id} onChange={updateForm(setUserForm)} autoComplete="off" required />
                )}
              </label>
            </div>

            <div className="users-form-grid">
              <label>
                <span>First Name</span>
                <input name="firstName" placeholder="e.g. Jer Erick" value={userForm.firstName} onChange={updateForm(setUserForm)} autoComplete="given-name" required />
              </label>
              <label>
                <span>Last Name</span>
                <input name="lastName" placeholder="e.g. Dumalagan" value={userForm.lastName} onChange={updateForm(setUserForm)} autoComplete="family-name" required />
              </label>
            </div>

            {(editingUserId || (!roleFromHash && roleFilter === 'all')) && (
              <label>
                <span>Role</span>
                <select name="role" value={userForm.role} onChange={updateForm(setUserForm)}>
                  <option value="student">Student</option>
                  <option value="teacher">Teacher</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
            )}

            {(userForm.role === 'student' || userForm.role === 'teacher') && (
              <label>
                <span>Program</span>
                <select name="course" value={userForm.course} onChange={updateForm(setUserForm)} required>
                  {programOptions.map((program) => <option key={program} value={program}>{program}</option>)}
                </select>
              </label>
            )}

            <div className="users-form-grid users-form-grid-two">
              <label>
                <span>School Year</span>
                <input name="schoolYear" placeholder="e.g. 2025-2026" value={userForm.schoolYear} onChange={updateForm(setUserForm)} required />
              </label>
              {!editingUserId && (
                <label>
                  <span>Temporary Password</span>
                  <input name="password" type="password" placeholder="At least 8 characters" value={userForm.password} onChange={updateForm(setUserForm)} autoComplete="new-password" minLength={8} required />
                </label>
              )}
            </div>

            {editingUserId && userForm.role === 'student' && (
              <section className="student-course-assignment-panel">
                <span>Course / Subject Assignments</span>
                {assignableCourses.length > 0 ? (
                  <div className="student-course-assignment-list">
                    {assignableCourses.map((course) => {
                      const courseId = String(course.id);
                      const hasTeacherLead = Boolean(course.teacherId);

                      return (
                        <label key={courseId} className={`users-check-row ${hasTeacherLead ? '' : 'disabled'}`.trim()}>
                          <b>{course.name}</b>
                          <small>{course.code}{hasTeacherLead ? '' : ' - assign a teacher lead first'}</small>
                          <input
                            type="checkbox"
                            checked={selectedCourseIds.includes(courseId)}
                            disabled={!hasTeacherLead}
                            onChange={(event) => {
                              setSelectedCourseIds((currentIds) => (
                                event.target.checked
                                  ? Array.from(new Set([...currentIds, courseId]))
                                  : currentIds.filter((currentId) => currentId !== courseId)
                              ));
                            }}
                          />
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <p className="users-assignment-empty">Create courses first, then return here to assign them.</p>
                )}
              </section>
            )}

            {editingUserId && (
              <section className="users-security-panel">
                <span className="users-security-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M7 11V8a5 5 0 0 1 10 0v3" />
                    <path d="M5 11h14v10H5z" />
                  </svg>
                </span>
                <span>
                  <strong>Authentication</strong>
                  <small>Update user access credentials</small>
                </span>
                <button type="button" onClick={() => editingUser && handleResetPassword(editingUser)} disabled={isSaving || !editingUser}>
                  Reset Password
                </button>
              </section>
            )}

            <div className="users-modal-actions">
              <button type="button" className="admin-tool-secondary" onClick={closeUserForm} disabled={isSaving}>Cancel</button>
              <button type="submit" className="users-primary-btn" disabled={isSaving}>{editingUserId ? 'Save Changes' : `Add ${roleLabel(userForm.role)}`}</button>
            </div>
          </form>
        </div>
      )}

      {resetPasswordUser && (
        <div className="users-modal-overlay" role="presentation">
          <form className="users-modal reset-password-modal" onSubmit={handleSubmitResetPassword} role="dialog" aria-modal="true" aria-labelledby="reset-password-title" autoComplete="off">
            <span className="users-modal-icon reset-password-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M15 7a4 4 0 1 0-3.4 4" />
                <path d="M12 11h9l-2 2 2 2" />
              </svg>
            </span>
            <h2 id="reset-password-title">Reset Password</h2>
            <label>
              <span>User</span>
              <input value={formatName(resetPasswordUser.name)} readOnly />
            </label>
            <label>
              <span>New Password</span>
              <input name="password" type="password" placeholder="New password" value={resetPasswordForm.password} onChange={updateForm(setResetPasswordForm)} autoComplete="new-password" required />
            </label>
            <label>
              <span>Confirm Password</span>
              <input name="confirmPassword" type="password" placeholder="Confirm password" value={resetPasswordForm.confirmPassword} onChange={updateForm(setResetPasswordForm)} autoComplete="new-password" required />
            </label>
            <p className="reset-password-warning">
              <span aria-hidden="true">!</span>
              User will need to log in again after resetting.
            </p>
            <div className="users-modal-actions reset-password-actions">
              <button type="submit" className="users-primary-btn" disabled={isSaving}>Reset Password</button>
              <button type="button" className="admin-tool-secondary" onClick={closeResetPasswordForm} disabled={isSaving}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {isCourseFormOpen && (
        <div className="users-modal-overlay" role="presentation">
          <form className="users-modal course-form-modal" onSubmit={handleSubmitCourse} role="dialog" aria-modal="true" aria-labelledby="courses-modal-title">
            <span className="course-modal-icon" aria-hidden="true" />
            <h2 id="courses-modal-title">{editingCourseId ? 'Edit Course' : 'Create Course'}</h2>
            <label>
              <span>Course</span>
              <input name="name" placeholder="e.g., Programming 2" value={courseForm.name} onChange={updateForm(setCourseForm)} required />
            </label>
            <label>
              <span>Description</span>
              <input name="description" placeholder="e.g., Capstone Project 2" value={courseForm.description} onChange={updateForm(setCourseForm)} />
            </label>
            <div className="course-modal-two-column">
              <label>
                <span>Semester</span>
                <select name="semester" value={courseForm.semester} onChange={updateForm(setCourseForm)}>
                  <option>1st Semester</option>
                  <option>2nd Semester</option>
                  <option>Summer</option>
                </select>
              </label>
              <label>
                <span>Offer Code</span>
                <input name="code" placeholder="e.g. 11037" value={courseForm.code} onChange={updateForm(setCourseForm)} required />
              </label>
            </div>
            <div className="course-modal-two-column">
              <label>
                <span>School Year</span>
                <input name="schoolYear" placeholder="e.g. 2025-2026" value={courseForm.schoolYear} onChange={updateForm(setCourseForm)} />
              </label>
              <label>
                <span>Teacher Lead</span>
                <select name="teacherId" value={courseForm.teacherId} onChange={updateForm(setCourseForm)}>
                  <option value="">Unassigned</option>
                  {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{formatName(teacher.name)}</option>)}
                </select>
              </label>
            </div>
            <div className="users-modal-actions">
              <button type="button" className="admin-tool-secondary" onClick={closeCourseForm} disabled={isSaving}>Cancel</button>
              <button type="submit" className="users-primary-btn" disabled={isSaving}>{editingCourseId ? 'Save Course' : 'Create Course'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default ManageUsers;
