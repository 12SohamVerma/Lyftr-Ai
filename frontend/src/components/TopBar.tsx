import { Menu, Moon, SquarePen, Sun } from "lucide-react";

interface Props {
  model: string | null;
  dark: boolean;
  onToggleTheme: () => void;
  onOpenSidebar: () => void;
  onNewChat: () => void;
}

export function TopBar({ model, dark, onToggleTheme, onOpenSidebar, onNewChat }: Props) {
  const iconBtn = "flex h-9 w-9 items-center justify-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink";
  return (
    <header className="flex h-14 shrink-0 items-center gap-1 px-2 sm:px-3">
      <button type="button" onClick={onOpenSidebar} className={`${iconBtn} lg:hidden`} aria-label="Open sidebar">
        <Menu size={19} />
      </button>
      <div className="flex min-w-0 items-baseline gap-2 px-2">
        <span className="whitespace-nowrap text-[17px] font-semibold">Lyftr AI</span>
        {model && (
          <span className="hidden truncate text-sm text-faint sm:inline" data-testid="active-model" title="Model configured on the server (LLM_MODEL)">
            {model}
          </span>
        )}
      </div>
      <div className="flex-1" />
      <button type="button" onClick={onNewChat} className={`${iconBtn} lg:hidden`} aria-label="New chat">
        <SquarePen size={18} />
      </button>
      <button
        type="button"
        onClick={onToggleTheme}
        className={iconBtn}
        aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
        title={dark ? "Light theme" : "Dark theme"}
      >
        {dark ? <Sun size={18} /> : <Moon size={18} />}
      </button>
    </header>
  );
}
