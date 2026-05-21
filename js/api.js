async function fetchSheet(sheet) {
  try {
    const res = await fetch(`${API_URL}?sheet=${sheet}&t=${Date.now()}`);
    const json = await res.json();
    return json.ok ? json.data : null;
  } catch (e) {
    console.error('Error cargando', sheet, e);
    return null;
  }
}
