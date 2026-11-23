export const isValidSchoolYear = (value) => {
  const match = /^(\d{4})-(\d{4})$/.exec(String(value ?? '').trim());
  return Boolean(match && Number(match[1]) >= 1900 && Number(match[2]) === Number(match[1]) + 1);
};

export const getCurrentSchoolYear = (date = new Date()) => {
  const startYear = date.getFullYear();
  return `${startYear}-${startYear + 1}`;
};

export const getSchoolYearOptions = (selectedValue = '') => {
  const currentYear = new Date().getFullYear();
  const options = new Set();

  for (let startYear = currentYear - 10; startYear <= currentYear + 10; startYear += 1) {
    options.add(`${startYear}-${startYear + 1}`);
  }

  const selectedYear = String(selectedValue ?? '').trim();
  if (isValidSchoolYear(selectedYear)) options.add(selectedYear);

  return [...options].sort((left, right) => Number(left.slice(0, 4)) - Number(right.slice(0, 4)));
};
