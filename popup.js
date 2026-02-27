document.addEventListener("DOMContentLoaded", async () => {
  const inputEl = document.getElementById("subjectCode");
  const addBtn = document.getElementById("addBtn");
  const listEl = document.getElementById("subjectList");
  const loginBtn = document.getElementById("loginBtn");

  // Load danh sách môn học từ Storage
  async function renderList() {
    listEl.innerHTML = "";
    const { targetSubjects = [] } =
      await chrome.storage.local.get("targetSubjects");

    if (targetSubjects.length === 0) {
      listEl.innerHTML = "<li><i>Chưa theo dõi môn nào</i></li>";
      return;
    }

    targetSubjects.forEach((code) => {
      const li = document.createElement("li");
      li.textContent = code;

      const removeBtn = document.createElement("button");
      removeBtn.textContent = "Xóa";
      removeBtn.className = "danger";
      removeBtn.onclick = () => removeSubject(code);

      li.appendChild(removeBtn);
      listEl.appendChild(li);
    });
  }

  // Thêm môn
  addBtn.addEventListener("click", async () => {
    const code = inputEl.value.trim().toUpperCase();
    if (!code) return;

    const { targetSubjects = [] } =
      await chrome.storage.local.get("targetSubjects");
    if (!targetSubjects.includes(code)) {
      targetSubjects.push(code);
      await chrome.storage.local.set({ targetSubjects });
      inputEl.value = "";
      renderList();
    }
  });

  // Xóa môn
  async function removeSubject(codeToRemove) {
    let { targetSubjects = [] } =
      await chrome.storage.local.get("targetSubjects");
    targetSubjects = targetSubjects.filter((code) => code !== codeToRemove);
    await chrome.storage.local.set({ targetSubjects });

    // Xóa luôn lịch sử điểm của môn này trong cache
    await chrome.storage.local.remove(codeToRemove);
    renderList();
  }

  // Mở trang login
  loginBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: "https://student.citd.edu.vn/signin" });
  });

  renderList();

  // Lấy các element mới
  const userEl = document.getElementById("usernameInput");
  const passEl = document.getElementById("passwordInput");
  const saveAuthBtn = document.getElementById("saveAuthBtn");
  const authStatus = document.getElementById("authStatus");

  // Load thông tin cũ nếu có (chỉ hiển thị username, không show pass ra input)
  chrome.storage.local.get(["citd_username", "citd_password"], (data) => {
    if (data.citd_username) userEl.value = data.citd_username;
    if (data.citd_password) passEl.value = "********"; // Fake password mask cho UX
  });

  // Lưu tài khoản
  saveAuthBtn.addEventListener("click", async () => {
    const user = userEl.value.trim();
    const pass = passEl.value.trim();

    // Nếu người dùng không nhập gì mới mà bấm lưu (đang ở trạng thái mask) thì bỏ qua
    if (pass === "********") return;

    if (user && pass) {
      await chrome.storage.local.set({
        citd_username: user,
        citd_password: pass,
      });
      authStatus.style.display = "block";
      setTimeout(() => (authStatus.style.display = "none"), 2000);

      // Chạy thử logic checkGrades ngay lập tức để test login
      chrome.alarms.create("checkGrades_immediate", { when: Date.now() });
    }
  });
});
