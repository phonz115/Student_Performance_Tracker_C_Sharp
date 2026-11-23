import { getSchoolYearOptions, isValidSchoolYear } from '../../utils/schoolYearOptions';

const SchoolYearSelect = ({ value = '', onChange, name, required = true }) => {
  const normalizedValue = String(value ?? '').trim();
  const validValue = isValidSchoolYear(normalizedValue);

  return (
    <select name={name} value={normalizedValue} onChange={onChange} required={required}>
      {!normalizedValue && <option value="" disabled>Select a school year</option>}
      {normalizedValue && !validValue && (
        <option value={normalizedValue} disabled>{normalizedValue} (select a valid school year)</option>
      )}
      {getSchoolYearOptions(normalizedValue).map((schoolYear) => (
        <option key={schoolYear} value={schoolYear}>{schoolYear}</option>
      ))}
    </select>
  );
};

export default SchoolYearSelect;
