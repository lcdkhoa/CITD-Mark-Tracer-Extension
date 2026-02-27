const CHECK_URL = "https://student.citd.edu.vn/points?v=20250201";
const LOGIN_URL = "https://student.citd.edu.vn/signin";
const AUTH_URL = "https://student.citd.edu.vn/signin/authenticate"; // Endpoint xử lý Login thật
const PLACEHOLDER_ICON =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

console.log("🚀 [CITD] Extension Service Worker khởi động...");

let isAutoLoggingIn = false;

// Lưu vết log
async function saveExecutionLog(status) {
  const { debugLogs = [] } = await chrome.storage.local.get("debugLogs");
  debugLogs.push(`${new Date().toLocaleString()}: ${status}`);
  if (debugLogs.length > 30) debugLogs.shift();
  await chrome.storage.local.set({ debugLogs });
}

// Khởi tạo mặc định
chrome.runtime.onInstalled.addListener(async () => {
  chrome.alarms.create("checkGrades", { periodInMinutes: 1 });

  const { targetSubjects } = await chrome.storage.local.get("targetSubjects");
  if (!targetSubjects) {
    await chrome.storage.local.set({
      targetSubjects: ["IE104", "IE303", "IE106", "IE103", "MA004"],
    });
  }
  saveExecutionLog("Extension Installed");
});

// Lắng nghe báo thức
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "checkGrades" || alarm.name === "checkGrades_immediate") {
    checkGrades();
  }
});

// Click vào Noti
chrome.notifications.onClicked.addListener((notificationId) => {
  if (
    notificationId === "session-expired" ||
    notificationId === "login-failed"
  ) {
    chrome.tabs.create({ url: LOGIN_URL });
  } else {
    chrome.tabs.create({ url: "https://student.citd.edu.vn/points" });
  }
  chrome.notifications.clear(notificationId);
});

// HÀM AUTO-LOGIN (ĐÃ UPDATE THEO cURL)
async function performAutoLogin() {
  const { citd_username, citd_password } = await chrome.storage.local.get([
    "citd_username",
    "citd_password",
  ]);
  if (!citd_username || !citd_password) {
    console.log("❌ [CITD] Chưa có tài khoản trong Storage.");
    return false;
  }

  console.log("🔄 [CITD] Đang tiến hành Auto-Login...");
  try {
    // 1. GET trang signin để lấy Session Cookie và CSRF Token
    const loginPageRes = await fetch(LOGIN_URL);
    const loginHtml = await loginPageRes.text();

    // 2. Bóc tách rise_csrf_token chuẩn xác
    let csrfToken = "";
    const inputMatch = loginHtml.match(
      /<input[^>]*name=["']rise_csrf_token["'][^>]*>/i,
    );
    if (inputMatch) {
      const valMatch = inputMatch[0].match(/value=["']([^"']+)["']/i);
      if (valMatch) csrfToken = valMatch[1];
    }

    if (!csrfToken) {
      console.warn("⚠️ [CITD] Không tìm thấy rise_csrf_token trong HTML.");
    }

    // 3. Build Payload y hệt cURL
    const formData = new URLSearchParams();
    formData.append("rise_csrf_token", csrfToken);
    formData.append("email", citd_username);
    formData.append("password", citd_password);
    formData.append("redirect", ""); // Param bắt buộc theo cURL

    // 4. Bắn POST request tới /signin/authenticate
    const loginRes = await fetch(AUTH_URL, {
      method: "POST",
      body: formData,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: LOGIN_URL,
      },
    });

    // 5. Check kết quả: Nếu đăng nhập thành công, nó sẽ redirect khỏi trang signin
    if (!loginRes.url.includes("/signin")) {
      console.log("✅ [CITD] Auto-Login thành công!");
      await saveExecutionLog("Auto-Login Successful");
      return true;
    } else {
      console.error("❌ [CITD] Đăng nhập thất bại (Sai pass hoặc bị chặn).");
      await saveExecutionLog("Auto-Login Failed: Check credentials");
      return false;
    }
  } catch (error) {
    console.error("🚨 [CITD] Lỗi mạng khi Auto-Login:", error);
    await saveExecutionLog(`Auto-Login Error: ${error.message}`);
    return false;
  }
}

// HÀM QUÉT ĐIỂM
async function checkGrades() {
  if (isAutoLoggingIn) return;

  const timestamp = new Date().toLocaleTimeString();
  console.log(`🔍 [CITD] Đang kiểm tra điểm tại: ${timestamp}`);

  try {
    const { targetSubjects = [] } =
      await chrome.storage.local.get("targetSubjects");
    if (targetSubjects.length === 0) return;

    const response = await fetch(CHECK_URL);

    // Bị đá về trang signin -> Xử lý Auto-Login
    if (response.url.includes("/signin")) {
      console.warn("⚠️ [CITD] Session hết hạn, URL bị đá về:", response.url);

      isAutoLoggingIn = true;
      const loginSuccess = await performAutoLogin();
      isAutoLoggingIn = false;

      if (loginSuccess) {
        return checkGrades(); // Đệ quy quét lại ngay lập tức
      } else {
        chrome.action.setBadgeText({ text: "ERR" });
        chrome.action.setBadgeBackgroundColor({ color: "#FF0000" });

        const { hasNotifiedLogin } =
          await chrome.storage.local.get("hasNotifiedLogin");
        if (!hasNotifiedLogin) {
          chrome.notifications.create("session-expired", {
            type: "basic",
            iconUrl: PLACEHOLDER_ICON,
            title: "CITD: Mất kết nối!",
            message:
              "Tự động đăng nhập thất bại. Vui lòng mở Extension để cập nhật lại Mật khẩu.",
            priority: 2,
          });
          await chrome.storage.local.set({ hasNotifiedLogin: true });
        }
        return;
      }
    }

    // Pass qua bước check Session -> Parse HTML
    await chrome.storage.local.set({ hasNotifiedLogin: false });
    const html = await response.text();

    if (!(await chrome.offscreen.hasDocument?.())) {
      await chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: ["DOM_PARSER"],
        justification: "Parse HTML",
      });
    }

    const results = await chrome.runtime.sendMessage({
      type: "parse-html",
      html: html,
    });
    if (!results || !Array.isArray(results)) return;

    let gradedCount = 0;

    results.forEach((item) => {
      // Auto-save tên môn học cho popup UI
      if (item.code && item.name) {
        chrome.storage.local.set({ [`${item.code}_name`]: item.name });
      }

      if (targetSubjects.includes(item.code)) {
        if (item.score !== "-" && item.score !== "") {
          gradedCount++;

          chrome.storage.local.get([item.code], (result) => {
            if (result[item.code] !== item.score) {
              chrome.notifications.create({
                type: "basic",
                iconUrl: PLACEHOLDER_ICON,
                title: "CITD: CÓ ĐIỂM MỚI!",
                message: `Môn ${item.name} đã có điểm: ${item.score}.`,
                priority: 2,
              });
              chrome.storage.local.set({ [item.code]: item.score });
            }
          });
        }
      }
    });

    // Cập nhật Badge số môn có điểm
    if (gradedCount > 0) {
      chrome.action.setBadgeText({ text: gradedCount.toString() });
      chrome.action.setBadgeBackgroundColor({ color: "#00C851" });
    } else {
      chrome.action.setBadgeText({ text: "" });
    }

    await saveExecutionLog(
      `Checked. Found ${gradedCount} graded in ${targetSubjects.length} targets.`,
    );
    console.log(
      `✅ [CITD] Quét xong. Cập nhật Badge: ${gradedCount > 0 ? gradedCount : "Trống"}`,
    );
  } catch (error) {
    console.error("🚨 [CITD] Lỗi fetch:", error);
    chrome.action.setBadgeText({ text: "!" });
    chrome.action.setBadgeBackgroundColor({ color: "#FFA500" });
    await saveExecutionLog(`Error: ${error.message}`);
  }
}
