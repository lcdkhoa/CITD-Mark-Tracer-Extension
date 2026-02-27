chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'parse-html') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(message.html, 'text/html');
    const rows = doc.querySelectorAll('tr');
    const data = [];

    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 8) {
        data.push({
          code: cells[1].innerText.trim(),
          name: cells[2].innerText.trim(),
          score: cells[8].innerText.trim()
        });
      }
    });
    sendResponse(data);
  }
});