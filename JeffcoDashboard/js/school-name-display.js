(function initSchoolNameDisplay(global) {
  const keepTerminalSchool = new Set([
    'long view high school',
    'mountain phoenix community school',
    'new america school',
    'norma anderson preschool',
    'rocky mountain deaf school'
  ]);

  const displayNameOverrides = new Map([
    ['bradford k8 north', 'Bradford K-8 North'],
    ['bradford k8 south', 'Bradford K-8 South']
  ]);

  function normalizeName(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function formatSchoolDisplayName(value) {
    const name = normalizeName(value);
    if (!name) return '';
    const override = displayNameOverrides.get(name.toLowerCase());
    if (override) return override;
    if (keepTerminalSchool.has(name.toLowerCase())) return name;
    return name.replace(/\s+School$/i, '');
  }

  global.formatSchoolDisplayName = formatSchoolDisplayName;
})(typeof window !== 'undefined' ? window : globalThis);
