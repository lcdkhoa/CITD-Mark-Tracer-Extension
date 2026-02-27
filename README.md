# CITD Grade Checker (CITD Mark Tracer Extension)

Công cụ tự động kiểm tra và thông báo điểm số cho sinh viên CITD (Trung tâm Phát triển Công nghệ Thông tin - ĐHQG-HCM).

## 🚀 Giới thiệu
**CITD Grade Checker** là một Chrome Extension giúp sinh viên tự động theo dõi điểm số trên hệ thống [student.citd.edu.vn](https://student.citd.edu.vn). Bạn không cần phải F5 trang web liên tục, extension sẽ làm việc đó thay bạn và gửi thông báo ngay lập tức khi có điểm mới.

## 🛠 Công nghệ sử dụng (Tech Stack)
Dự án được xây dựng dựa trên các công nghệ hiện đại nhất của Chrome Extension:
- **Manifest V3**: Tiêu chuẩn mới nhất cho Chrome Extension, đảm bảo an toàn và hiệu năng.
- **Service Worker (`background.js`)**: Chạy ngầm để quản lý lịch trình kiểm tra điểm bằng `chrome.alarms`.
- **Offscreen Documents**: Sử dụng để phân giải HTML (DOM Parsing) một cách an toàn trong môi trường Service Worker.
- **Chrome Storage API**: Lưu trữ điểm số cũ để so sánh và phát hiện thay đổi.
- **Chrome Notifications API**: Gửi thông báo đẩy trực tiếp trên màn hình máy tính.

## 📋 Tính năng chính
- ✅ **Tự động kiểm tra**: Kiểm tra điểm định kỳ (mặc định mỗi phút một lần).
- ✅ **Thông báo tức thì**: Bắn thông báo Windows/macOS khi phát hiện thay đổi điểm số của các môn học mục tiêu.
- ✅ **Lưu vết debug**: Lưu lại lịch sử kiểm tra (logs) trong bộ nhớ local để theo dõi trạng thái hoạt động.
- ✅ **Tiết kiệm tài nguyên**: Hoạt động hiệu quả, không làm chậm trình duyệt.

## 📖 Hướng dẫn sử dụng

### 1. Cài đặt (Dành cho Nhà phát triển)
Hiện tại extension đang trong giai đoạn phát triển, bạn có thể cài đặt theo các bước sau:
1. Tải toàn bộ mã nguồn về máy tính.
2. Mở trình duyệt Chrome, truy cập địa chỉ `chrome://extensions/`.
3. Bật **Developer mode** (Chế độ dành cho nhà phát triển) ở góc trên bên phải.
4. Nhấn nút **Load unpacked** (Tải tiện ích đã giải nén) và chọn thư mục chứa mã nguồn này.

### 2. Cấu hình môn học mục tiêu
Mở file `background.js`, tìm biến `TARGET_SUBJECTS` để thêm các mã môn học bạn muốn theo dõi:
```javascript
const TARGET_SUBJECTS = ["IE104", "IE303", "IE106", "IE103", "MA004"];
```

### 3. Cách hoạt động
- Sau khi cài đặt, extension sẽ tự động đăng ký một lịch trình (`alarm`) kiểm tra điểm.
- Bạn cần đảm bảo đã **đăng nhập** vào hệ thống [student.citd.edu.vn](https://student.citd.edu.vn) trên trình duyệt để extension có quyền lấy dữ liệu.
- Khi phát hiện mã môn học trong danh sách `TARGET_SUBJECTS` có điểm (khác "-" hoặc rỗng) và điểm này khác với lần kiểm tra trước, một thông báo sẽ xuất hiện.

## ⚠️ Lưu ý quan trọng
- **Session**: Nếu bạn đăng xuất hoặc session hết hạn, extension sẽ không thể kiểm tra điểm. Hãy đảm bảo session của bạn luôn còn hiệu lực.
- **Rate Limit**: Mặc định extension kiểm tra mỗi 1 phút để test. Khi sử dụng thực tế, nên điều chỉnh `periodInMinutes` trong `background.js` lên 15-30 phút để tránh bị máy chủ CITD chặn truy cập.

---
*Phát triển bởi [lcdkhoa](https://github.com/lcdkhoa)*
