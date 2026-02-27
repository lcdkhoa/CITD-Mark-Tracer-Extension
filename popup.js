document.addEventListener("DOMContentLoaded", async () => {
  const inputEl = document.getElementById("subjectCode");
  const addBtn = document.getElementById("addBtn");
  const listEl = document.getElementById("subjectList");

  const loginForm = document.getElementById("loginForm");
  const loggedInState = document.getElementById("loggedInState");
  const userEl = document.getElementById("usernameInput");
  const passEl = document.getElementById("passwordInput");
  const saveAuthBtn = document.getElementById("saveAuthBtn");
  const displayEmail = document.getElementById("displayEmail");
  const logoutBtn = document.getElementById("logoutBtn");
  const webLink = document.getElementById("webLink");

  // Xóa Badge vì user đã xem
  chrome.action.setBadgeText({ text: "" });
  await chrome.storage.local.set({ unreadCount: 0 });

  // SET UP INTERVAL SELECTOR
  const intervalRadios = document.querySelectorAll('input[name="interval"]');
  const { checkInterval = 1 } = await chrome.storage.local.get("checkInterval"); // Mặc định 1 phút
  const radioToCheck =
    document.getElementById(`int-${checkInterval}`) ||
    document.getElementById("int-1");
  radioToCheck.checked = true;

  // Lắng nghe sự thay đổi thời gian quét
  intervalRadios.forEach((radio) => {
    radio.addEventListener("change", async (e) => {
      const newInterval = parseInt(e.target.value, 10);
      await chrome.storage.local.set({ checkInterval: newInterval });
      // Background.js sẽ tự động bắt sự kiện storage change để cài lại Alarm!
    });
  });

  async function renderList() {
    listEl.innerHTML = "";
    const { targetSubjects = [] } =
      await chrome.storage.local.get("targetSubjects");

    if (targetSubjects.length === 0) {
      listEl.innerHTML =
        '<li style="justify-content: center; color: #94a3b8; font-size: 13px;">Chưa theo dõi môn nào</li>';
      return;
    }

    const storageKeys = targetSubjects
      .map((code) => `${code}_name`)
      .concat(targetSubjects);
    const storageData = await chrome.storage.local.get(storageKeys);

    targetSubjects.forEach((code) => {
      const li = document.createElement("li");

      const subjectName = storageData[`${code}_name`] || "Đang đồng bộ...";
      const score = storageData[code];

      const infoDiv = document.createElement("div");
      infoDiv.className = "sub-info";
      infoDiv.innerHTML = `
        <span class="sub-code">${code}</span>
        <span class="sub-name" title="${subjectName}">${subjectName}</span>
      `;

      const actionDiv = document.createElement("div");
      actionDiv.className = "sub-actions";

      const scoreBadge = document.createElement("span");
      if (score && score !== "-" && score !== "") {
        scoreBadge.className = "score-badge graded";
        scoreBadge.textContent = score;
      } else {
        scoreBadge.className = "score-badge pending";
        scoreBadge.textContent = "Chờ";
      }

      const removeBtn = document.createElement("button");
      removeBtn.innerHTML = "✕";
      removeBtn.className = "btn-delete";
      removeBtn.title = "Xóa môn này";
      removeBtn.onclick = () => removeSubject(code);

      actionDiv.appendChild(scoreBadge);
      actionDiv.appendChild(removeBtn);

      li.appendChild(infoDiv);
      li.appendChild(actionDiv);
      listEl.appendChild(li);
    });
  }

  async function checkAuthState() {
    const { citd_username } = await chrome.storage.local.get(["citd_username"]);
    if (citd_username) {
      loginForm.style.display = "none";
      loggedInState.style.display = "flex";
      displayEmail.textContent = citd_username;
      displayEmail.title = citd_username;
    } else {
      loginForm.style.display = "flex";
      loggedInState.style.display = "none";
      userEl.value = "";
      passEl.value = "";
    }
  }

  saveAuthBtn.addEventListener("click", async () => {
    const user = userEl.value.trim();
    const pass = passEl.value.trim();
    if (user && pass) {
      await chrome.storage.local.set({
        citd_username: user,
        citd_password: pass,
      });
      checkAuthState();
      chrome.alarms.create("checkGrades_immediate", { when: Date.now() });
    }
  });

  logoutBtn.addEventListener("click", async () => {
    await chrome.storage.local.remove(["citd_username", "citd_password"]);
    checkAuthState();
  });

  addBtn.addEventListener("click", async () => {
    const code = inputEl.value.trim().toUpperCase();
    if (!code) return;

    const { targetSubjects = [] } =
      await chrome.storage.local.get("targetSubjects");
    if (!targetSubjects.includes(code)) {
      targetSubjects.push(code);
      await chrome.storage.local.set({ targetSubjects });
      inputEl.value = "";
      chrome.alarms.create("checkGrades_immediate", { when: Date.now() });
      renderList();
    }
  });

  inputEl.addEventListener("keypress", (e) => {
    if (e.key === "Enter") addBtn.click();
  });

  async function removeSubject(codeToRemove) {
    let { targetSubjects = [] } =
      await chrome.storage.local.get("targetSubjects");
    targetSubjects = targetSubjects.filter((code) => code !== codeToRemove);
    await chrome.storage.local.set({ targetSubjects });

    await chrome.storage.local.remove([codeToRemove, `${codeToRemove}_name`]);
    renderList();
  }

  webLink.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: "https://student.citd.edu.vn/points" });
  });

  checkAuthState();
  renderList();
});
