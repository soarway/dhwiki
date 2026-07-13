# 登录页面使用指南

## 📱 页面特性

### 🎨 设计风格
- **苹果风格UI**：采用现代化、简洁的苹果设计语言
- **响应式布局**：完美适配桌面端和移动端
- **左右分栏**：
  - 左侧：知识主题展示区（大屏显示）
  - 右侧：登录表单区

### ✨ 功能特性

#### 1️⃣ 账号密码输入
- 账号输入框
- 密码输入框（支持显示/隐藏密码）
- 输入框焦点效果和过渡动画

#### 2️⃣ 验证码功能
- 自动生成4位验证码
- 大写字母和数字组合
- 点击刷新按钮重新生成
- 验证码不区分大小写

#### 3️⃣ 记住我功能
- 勾选后保存用户名到本地存储
- 下次访问可自动填充（可扩展）

#### 4️⃣ 其他功能
- 忘记密码链接（待对接）
- 服务条款和隐私政策链接
- 平滑的交互动画

## 🎯 测试说明

### 当前版本（前端演示版）

**测试登录：**
1. 输入任意账号（非空即可）
2. 输入任意密码（非空即可）
3. 输入显示的验证码（不区分大小写）
4. 点击"登录"按钮

**验证码规则：**
- 必须输入正确的验证码
- 验证码错误会提示并刷新
- 点击刷新图标可重新生成

**记住我功能：**
- 勾选"记住我"后，用户名会保存到 `localStorage`
- 下次可扩展为自动填充功能

## 🔐 API对接建议

### 登录API接口

```typescript
// POST /api/auth/login
interface LoginRequest {
  username: string;
  password: string;
  captcha: string;
  rememberMe: boolean;
}

interface LoginResponse {
  success: boolean;
  token?: string;
  user?: {
    id: string;
    username: string;
    name: string;
    avatar?: string;
  };
  message?: string;
}
```

### 验证码API接口（可选）

```typescript
// GET /api/auth/captcha
interface CaptchaResponse {
  captchaId: string;
  captchaImage: string; // base64图片
}
```

### 修改建议

在 `Login.tsx` 的 `handleSubmit` 函数中：

```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  // 验证验证码
  if (captcha.toUpperCase() !== captchaCode) {
    alert('验证码错误！');
    setCaptcha('');
    setCaptchaCode(generateCaptcha());
    return;
  }

  try {
    // 调用登录API
    const response = await fetch('http://192.168.30.197:8080/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username,
        password,
        captcha,
        rememberMe,
      }),
    });

    const data = await response.json();

    if (data.success) {
      // 保存token
      localStorage.setItem('token', data.token);
      
      // 保存用户信息
      if (data.user) {
        localStorage.setItem('user', JSON.stringify(data.user));
      }

      // 记住用户名
      if (rememberMe) {
        localStorage.setItem('rememberedUser', username);
      }

      // 跳转到主页
      onLogin();
    } else {
      alert(data.message || '登录失败！');
      setCaptcha('');
      setCaptchaCode(generateCaptcha());
    }
  } catch (error) {
    console.error('登录错误:', error);
    alert('网络错误，请稍后重试！');
  }
};
```

## 🎨 左侧主题区域

### 展示内容
1. **Logo**：icanfly品牌标识
2. **系统标题**：知识库管理系统
3. **英文副标题**：icanfly Knowledge Base
4. **知识金句**（3条）：
   - 知识就是力量
   - 知识就是第一生产力
   - 知识改变命运

### 视觉效果
- 渐变蓝色背景（#0071e3 到 #005bb5）
- 毛玻璃效果卡片
- 柔和的背景装饰圆形
- 底部版权信息

## 📱 响应式设计

### 桌面端（≥1024px）
- 左右分栏布局
- 左侧主题区域占50%
- 右侧登录表单占50%

### 移动端（<1024px）
- 隐藏左侧主题区域
- 全屏显示登录表单
- 顶部显示Logo和系统名称

## 🔄 退出登录

在主界面中：
1. 点击左下角用户头像
2. 在弹出菜单中选择"退出系统"
3. 自动返回登录页面
4. 清除本地登录状态

## 🎯 下一步开发建议

1. **对接后端API**
   - 实现真实的用户认证
   - 集成服务端验证码
   - 添加JWT token管理

2. **增强安全性**
   - 密码加密传输
   - 防暴力破解（登录次数限制）
   - CSRF防护

3. **用户体验优化**
   - 添加加载状态
   - 表单验证提示
   - 错误信息优化
   - 自动聚焦

4. **扩展功能**
   - 忘记密码流程
   - 多因素认证（MFA）
   - 第三方登录（可选）

## 📄 文件说明

- `src/app/components/Login.tsx` - 登录组件
- `src/app/App.tsx` - 应用入口（包含登录状态管理）
- `src/app/components/Sidebar.tsx` - 侧边栏（包含退出登录）
