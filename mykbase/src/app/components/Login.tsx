import { useState, useEffect } from 'react';
import { Eye, EyeOff, RefreshCw } from 'lucide-react';

interface LoginProps {
  onLogin: () => void;
}

async function fetchCaptcha(): Promise<{ token: string; image: string }> {
  const res = await fetch('/api/captcha');
  if (!res.ok) throw new Error('获取验证码失败');
  return res.json();
}

export function Login({ onLogin }: LoginProps) {
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [captchaInput, setCaptchaInput] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaImage, setCaptchaImage] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [systemLogo, setSystemLogo] = useState<string | null>(null);
  const [systemName, setSystemName] = useState('知识管理系统');

  const loadCaptcha = async () => {
    try {
      const data = await fetchCaptcha();
      setCaptchaToken(data.token);
      setCaptchaImage(data.image);
      setCaptchaInput('');
    } catch {
      setErrorMsg('验证码加载失败，请刷新重试');
    }
  };

  useEffect(() => {
    const savedAccount = localStorage.getItem('rememberedAccount');
    if (savedAccount) { setAccount(savedAccount); setRememberMe(true); }
    fetch('/api/public-settings')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.system_logo) setSystemLogo(d.system_logo);
        if (d?.system_name) setSystemName(d.system_name);
      })
      .catch(() => {});
    loadCaptcha();
  }, []);

  const handleLogin = async () => {
    setErrorMsg('');
    if (!account || !password || !captchaInput) {
      setErrorMsg('请填写完整的登录信息');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: account,
          password,
          captcha_token: captchaToken,
          captcha_code: captchaInput,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.detail || '登录失败，请重试');
        loadCaptcha();
        return;
      }

      // 保存 token
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);

      if (rememberMe) {
        localStorage.setItem('rememberedAccount', account);
      } else {
        localStorage.removeItem('rememberedAccount');
      }

      onLogin();
    } catch {
      setErrorMsg('网络错误，请检查连接后重试');
      loadCaptcha();
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleLogin();
  };

  return (
    <div className="size-full flex bg-[#f5f5f7]">
      {/* Left Side - Image/Quote Section */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-[#0071e3] to-[#005bb5] p-16 flex-col justify-center items-center text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-64 h-64 bg-white rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-white rounded-full blur-3xl"></div>
        </div>

        <div className="relative z-10 max-w-lg space-y-12">
          <div className="space-y-4">
            <h1 className="text-5xl font-semibold tracking-tight">AI知识库系统</h1>
            <p className="text-xl text-white/90">让知识成为企业最宝贵的资产</p>
          </div>

          <div className="space-y-8">
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
              <p className="text-lg leading-relaxed">"知识就是力量"</p>
              <p className="text-sm text-white/70 mt-2">— 弗朗西斯·培根</p>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
              <p className="text-lg leading-relaxed">"科学技术是第一生产力"</p>
              <p className="text-sm text-white/70 mt-2">— 邓小平</p>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
              <p className="text-lg leading-relaxed">"知识是唯一不会因分享而减少的财富"</p>
              <p className="text-sm text-white/70 mt-2">— 托马斯·杰斐逊</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            {systemLogo ? (
              <img src={systemLogo} alt="logo" className="h-16 w-auto object-contain" style={{ maxWidth: '200px' }} />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-[#1d1d1f] flex items-center justify-center shadow-lg">
                <svg viewBox="0 0 120 120" className="w-9 h-9">
                  <path
                    d="M20 30 L40 20 L40 80 L20 90 Z M50 15 L70 5 L70 95 L50 105 Z M80 20 L100 10 L100 70 L80 80 Z"
                    fill="currentColor"
                    className="text-white"
                  />
                </svg>
              </div>
            )}
          </div>

          <div className="text-center mb-10">
            <h2 className="text-3xl font-semibold text-[#1d1d1f] mb-2">欢迎回来</h2>
            <p className="text-[#86868b]">登录 {systemName}</p>
          </div>

          <div className="space-y-5">
            {/* Error Message */}
            {errorMsg && (
              <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-[14px] text-red-600">
                {errorMsg}
              </div>
            )}

            {/* Account Input */}
            <div>
              <label className="block text-[14px] font-medium text-[#1d1d1f] mb-2">账号</label>
              <input
                type="text"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="请输入账号"
                className="w-full px-4 py-3 bg-white rounded-xl border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[15px] text-[#1d1d1f]"
              />
            </div>

            {/* Password Input */}
            <div>
              <label className="block text-[14px] font-medium text-[#1d1d1f] mb-2">密码</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="请输入密码"
                  className="w-full px-4 py-3 bg-white rounded-xl border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[15px] text-[#1d1d1f] pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-[#f5f5f7] transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5 text-[#86868b]" strokeWidth={1.5} />
                  ) : (
                    <Eye className="w-5 h-5 text-[#86868b]" strokeWidth={1.5} />
                  )}
                </button>
              </div>
            </div>

            {/* Captcha Input */}
            <div>
              <label className="block text-[14px] font-medium text-[#1d1d1f] mb-2">验证码</label>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={captchaInput}
                  onChange={(e) => setCaptchaInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="请输入验证码"
                  className="flex-1 px-4 py-3 bg-white rounded-xl border border-[#d2d2d7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all text-[15px] text-[#1d1d1f]"
                  maxLength={4}
                />
                <div className="flex items-center gap-2">
                  <div
                    className="w-[160px] h-[48px] rounded-xl overflow-hidden border border-[#d2d2d7] cursor-pointer flex-shrink-0"
                    onClick={loadCaptcha}
                    title="点击刷新验证码"
                  >
                    {captchaImage ? (
                      <img src={captchaImage} alt="验证码" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-[#f5f5f7] flex items-center justify-center">
                        <span className="text-[12px] text-[#86868b]">加载中...</span>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={loadCaptcha}
                    className="p-3 rounded-xl bg-white border border-[#d2d2d7] hover:bg-[#f5f5f7] hover:border-[#0071e3]/30 transition-all"
                    title="刷新验证码"
                  >
                    <RefreshCw className="w-5 h-5 text-[#86868b]" strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            </div>

            {/* Remember Me */}
            <div className="flex items-center">
              <input
                type="checkbox"
                id="rememberMe"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-[#d2d2d7] text-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/30"
              />
              <label htmlFor="rememberMe" className="ml-2 text-[14px] text-[#1d1d1f] cursor-pointer">
                记住我
              </label>
            </div>

            {/* Login Button */}
            <button
              onClick={handleLogin}
              disabled={isLoading}
              className="w-full py-3 bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl font-medium text-[15px] transition-all duration-150 shadow-sm hover:shadow-md"
            >
              {isLoading ? '登录中...' : '登录'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
