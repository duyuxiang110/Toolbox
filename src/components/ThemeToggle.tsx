/**
 * 主题切换按钮 - 暗色 / 亮色一键切换
 * 圆形图标按钮，日/月图标随当前主题变化
 */
import { Button, Tooltip } from 'antd';
import { SunOutlined, MoonOutlined } from '@ant-design/icons';
import { useTheme } from '../context/ThemeContext';

interface ThemeToggleProps {
  className?: string;
}

export default function ThemeToggle({ className }: ThemeToggleProps) {
  const { isDark, toggleTheme } = useTheme();

  return (
    <Tooltip title={isDark ? '切换到亮色模式' : '切换到暗色模式'}>
      <Button
        className={`theme-toggle-btn${className ? ` ${className}` : ''}`}
        shape="circle"
        icon={isDark ? <SunOutlined /> : <MoonOutlined />}
        onClick={toggleTheme}
        aria-label="切换主题"
      />
    </Tooltip>
  );
}
