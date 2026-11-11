import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useStatusToast } from '../hooks/useNotifications';
import { LoadingSpinner } from '../components/ui';
import { exportStructuredPdf } from '../utils/pdfExport';
import './StudentGrades.css';

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

const formatGradeValue = (grade) => Number(grade.score).toFixed(1) + (grade.teacherId ? '' : ' / 100');

const StudentGrades = () => {
  const { user, grades } = useAuth();
  const [selectedSchoolYear, setSelectedSchoolYear] = useState('All');
  const [selectedSemester, setSelectedSemester] = useState('All');
  const [selectedFeedback, setSelectedFeedback] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [reportToast, setReportToast] = useState('');
  const [reportErrorToast, setReportErrorToast] = useState('');
  const feedbackDialogRef = useRef(null);
  useStatusToast(reportToast, 'success', 'Report ready');
  useStatusToast(reportErrorToast, 'error', 'Download issue');

  useEffect(() => {
    const feedbackDialog = feedbackDialogRef.current;
    if (selectedFeedback && feedbackDialog && !feedbackDialog.open) {
      feedbackDialog.showModal();
    } else if (!selectedFeedback && feedbackDialog?.open) {
      feedbackDialog.close();
    }
  }, [selectedFeedback]);

  const studentGrades = useMemo(() => grades
    .filter((grade) => grade.studentId === user.id)
    .sort((left, right) => Number(right.id) - Number(left.id)), [grades, user.id]);
  const schoolYears = [...new Set(studentGrades.map((grade) => grade.schoolYear || '2025-2026'))];
  const semesters = [...new Set([
    '1st Semester',
    '2nd Semester',
    ...studentGrades.map((grade) => grade.semester || '1st Semester'),
  ])];
  const visibleGrades = useMemo(() => studentGrades.filter((grade) => (
    (selectedSchoolYear === 'All' || (grade.schoolYear || '2025-2026') === selectedSchoolYear)
    && (selectedSemester === 'All' || (grade.semester || '1st Semester') === selectedSemester)
  )), [studentGrades, selectedSchoolYear, selectedSemester]);

  const gradeGroups = useMemo(() => {
    const groups = new Map();
    visibleGrades.forEach((grade) => {
      const schoolYear = grade.schoolYear || '2025-2026';
      const semester = grade.semester || '1st Semester';
      const groupKey = JSON.stringify([grade.subject, schoolYear, semester]);
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          id: groupKey,
          subject: grade.subject,
          schoolYear,
          semester,
          terms: {},
        });
      }

      const termKey = getGradeTermKey(grade.term || 'Prelim');
      const group = groups.get(groupKey);
      const currentTermGrade = termKey ? group.terms[termKey] : null;
      if (termKey && (!currentTermGrade || Number(grade.id) > Number(currentTermGrade.id))) {
        group.terms[termKey] = grade;
      }
    });
    return [...groups.values()];
  }, [visibleGrades]);

  const handleDownloadReport = () => {
    try {
      setIsDownloading(true);
      setReportToast('');
      setReportErrorToast('');
      exportStructuredPdf({
        filename: `Grade_Report_${user.id}.pdf`,
        title: `Grade Report - ${user.name}`,
        meta: [
          { label: 'Student ID', value: user.id },
          { label: 'School Year', value: selectedSchoolYear },
          { label: 'Semester', value: selectedSemester },
        ],
        sections: [{
          title: 'Grades and Feedback',
          columns: [
            { header: 'Subject', accessor: 'subject', width: 1.2 },
            { header: 'School Year', accessor: 'schoolYear', width: 0.9 },
            { header: 'Semester', accessor: 'semester', width: 0.9 },
            { header: 'Prelim', accessor: (group) => (group.terms.prelim ? formatGradeValue(group.terms.prelim) : '-'), width: 0.7 },
            { header: 'Midterm', accessor: (group) => (group.terms.midterm ? formatGradeValue(group.terms.midterm) : '-'), width: 0.7 },
            { header: 'Finals', accessor: (group) => (group.terms.finals ? formatGradeValue(group.terms.finals) : '-'), width: 0.7 },
            {
              header: 'Feedback',
              accessor: (group) => GRADE_TERMS.map(({ key, label }) => {
                const feedback = group.terms[key]?.feedback?.trim();
                return feedback ? `${label}: ${feedback}` : null;
              }).filter(Boolean).join('; ') || 'No feedback',
              width: 1.5,
            },
          ],
          rows: gradeGroups,
          emptyMessage: 'No grades match the selected school year and semester.',
        }],
      });
      setReportToast('Your grade report downloaded successfully.');
    } catch {
      setReportErrorToast('We could not download your report. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="grades-page">
      <div className="grades-toolbar">
        <h1>Student Grades</h1>
        <div className="grades-filters">
          <label>
            <span>School Year</span>
            <select value={selectedSchoolYear} onChange={(event) => setSelectedSchoolYear(event.target.value)}>
              <option value="All">All years</option>
              {schoolYears.map((schoolYear) => <option value={schoolYear} key={schoolYear}>{schoolYear}</option>)}
            </select>
          </label>
          <label>
            <span>Semester</span>
            <select value={selectedSemester} onChange={(event) => setSelectedSemester(event.target.value)}>
              <option value="All">All semesters</option>
              {semesters.map((semester) => <option value={semester} key={semester}>{semester}</option>)}
            </select>
          </label>
        </div>
      </div>

      <section className="grades-table-card" aria-label="Grades and feedback">
        <table className="student-grades-table">
          <thead>
            <tr>
              <th>Subject</th>
              <th>School Year</th>
              <th>Semester</th>
              <th>Prelim</th>
              <th>Midterm</th>
              <th>Finals</th>
              <th>Feedback</th>
            </tr>
          </thead>
          <tbody>
            {gradeGroups.map((gradeGroup) => (
              <tr key={gradeGroup.id}>
                <td>{gradeGroup.subject}</td>
                <td>{gradeGroup.schoolYear}</td>
                <td>{gradeGroup.semester}</td>
                {GRADE_TERMS.map(({ key }) => (
                  <td key={key} className="grade-term-score">
                    {gradeGroup.terms[key] ? formatGradeValue(gradeGroup.terms[key]) : '-'}
                  </td>
                ))}
                <td className="feedback-cell">
                  <button className="view-feedback-btn" type="button" onClick={() => setSelectedFeedback(gradeGroup)}>
                    View feedback
                  </button>
                </td>
              </tr>
            ))}
            {gradeGroups.length === 0 && selectedSemester === '2nd Semester' && (
              <tr className="grades-placeholder-row" aria-label="No second-semester grades have been added">
                <td>-</td>
                <td>-</td>
                <td>2nd Semester</td>
                {GRADE_TERMS.map(({ key }) => <td className="grade-term-score" key={key}>-</td>)}
                <td />
              </tr>
            )}
            {gradeGroups.length === 0 && selectedSemester !== '2nd Semester' && (
              <tr>
                <td colSpan="7" className="grades-empty">No grades match the selected school year and semester.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <dialog
        className="feedback-dialog"
        ref={feedbackDialogRef}
        aria-labelledby="feedback-dialog-title"
        onClose={() => setSelectedFeedback(null)}
      >
        {selectedFeedback && (
          <div className="feedback-dialog-content">
            <div className="feedback-dialog-header">
              <div>
                <h2 id="feedback-dialog-title">Feedback</h2>
              </div>
              <button className="feedback-dialog-close" type="button" onClick={() => feedbackDialogRef.current?.close()}>
                Close
              </button>
            </div>
            <div className="feedback-dialog-terms">
              {GRADE_TERMS.map(({ key, label }) => (
                <section className="feedback-dialog-term" key={key}>
                  <h3>{label}</h3>
                  <p>{selectedFeedback.terms[key]?.feedback || 'No feedback has been provided for this grading period yet.'}</p>
                </section>
              ))}
            </div>
          </div>
        )}
      </dialog>

      <div className="grades-actions grades-report-actions">
        <button className="download-report-btn" type="button" onClick={handleDownloadReport} disabled={isDownloading}>
          <span className="button-content">
            {isDownloading && <LoadingSpinner label="Downloading grade report" size="small" />}
            {isDownloading ? 'Downloading...' : 'Download Report PDF'}
          </span>
        </button>
        <button className="print-report-btn" type="button" onClick={() => window.print()}>
          Print Report
        </button>
      </div>
    </div>
  );
};

export default StudentGrades;
