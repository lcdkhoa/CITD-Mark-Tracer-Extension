const CHECK_URL = "https://student.citd.edu.vn/points?v=20250201";
const LOGIN_URL = "https://student.citd.edu.vn/signin";
const PLACEHOLDER_ICON =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

console.log("🚀 [CITD] Extension Service Worker khởi động...");

async function saveExecutionLog(status) {
  const { debugLogs = [] } = await chrome.storage.local.get("debugLogs");
  debugLogs.push(`${new Date().toLocaleString()}: ${status}`);
  if (debugLogs.length > 30) debugLogs.shift();
  await chrome.storage.local.set({ debugLogs });
}

// Khởi tạo danh sách mặc định khi cài đặt
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

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "checkGrades") checkGrades();
});

// Xử lý click thông báo (Phân biệt Noti Login và Noti Điểm)
chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId === "session-expired") {
    chrome.tabs.create({ url: LOGIN_URL });
  } else {
    chrome.tabs.create({ url: "https://student.citd.edu.vn/points" });
  }
  chrome.notifications.clear(notificationId);
});

async function checkGrades() {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`🔍 [CITD] Đang kiểm tra điểm tại: ${timestamp}`);

  try {
    const { targetSubjects = [] } =
      await chrome.storage.local.get("targetSubjects");
    if (targetSubjects.length === 0) return;

    const response = await fetch(CHECK_URL);
    const html = await response.text();

    // XỬ LÝ HẾT SESSION
    if (html.includes('name="username"') || html.includes("login-form")) {
      console.warn("⚠️ [CITD] Session hết hạn.");

      // Set Badge cảnh báo (Chữ đỏ, viền đỏ)
      chrome.action.setBadgeText({ text: "ERR" });
      chrome.action.setBadgeBackgroundColor({ color: "#FF0000" });

      const { hasNotifiedLogin } =
        await chrome.storage.local.get("hasNotifiedLogin");
      if (!hasNotifiedLogin) {
        chrome.notifications.create("session-expired", {
          type: "basic",
          iconUrl: PLACEHOLDER_ICON,
          title: "CITD: Mất kết nối!",
          message: "Phiên đăng nhập đã hết hạn. Click để đăng nhập lại.",
          priority: 2,
        });
        await chrome.storage.local.set({ hasNotifiedLogin: true });
      }
      return;
    }

    // Nếu fetch thành công, reset trạng thái login báo lỗi
    await chrome.storage.local.set({ hasNotifiedLogin: false });

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
      if (targetSubjects.includes(item.code)) {
        if (item.score !== "-" && item.score !== "") {
          gradedCount++; // Tăng biến đếm số môn có điểm

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

    // UPDATE BADGE TEXT - Hiển thị số lượng môn đã có điểm
    if (gradedCount > 0) {
      chrome.action.setBadgeText({ text: gradedCount.toString() });
      chrome.action.setBadgeBackgroundColor({ color: "#00C851" }); // Màu xanh lá
    } else {
      chrome.action.setBadgeText({ text: "" }); // Ẩn badge nếu chưa có điểm nào
    }

    await saveExecutionLog(
      `Checked. Found ${gradedCount} graded in ${targetSubjects.length} targets.`,
    );
  } catch (error) {
    console.error("🚨 [CITD] Lỗi:", error);
    chrome.action.setBadgeText({ text: "!" });
    chrome.action.setBadgeBackgroundColor({ color: "#FFA500" }); // Màu cam cảnh báo lỗi mạng
  }
}
