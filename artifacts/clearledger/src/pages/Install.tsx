import { Link } from "wouter";
import { ArrowLeft, Share, MoreVertical, PlusSquare, Chrome } from "lucide-react";

export default function InstallPage() {
  return (
    <div className="min-h-screen bg-background text-foreground px-5 py-8 max-w-lg mx-auto">
      <Link href="/settings" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" />
        Back to Settings
      </Link>

      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
          <span className="font-bold text-primary text-lg">CL</span>
        </div>
        <div>
          <h1 className="text-xl font-bold">Install ClearLedger</h1>
          <p className="text-sm text-muted-foreground">Add to your home screen for quick access</p>
        </div>
      </div>

      {/* iPhone / Safari */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
            <Share className="w-4 h-4 text-blue-500" />
          </div>
          <h2 className="font-semibold text-base">iPhone — Safari</h2>
        </div>

        <ol className="space-y-4">
          {[
            { icon: <Share className="w-5 h-5 text-blue-500" />, text: <>Tap the <strong>Share</strong> button at the bottom of Safari (the square with an arrow pointing up)</> },
            { icon: <PlusSquare className="w-5 h-5 text-blue-500" />, text: <>Scroll down and tap <strong>&ldquo;Add to Home Screen&rdquo;</strong></> },
            { icon: <span className="text-blue-500 font-bold text-sm">CL</span>, text: <>Tap <strong>&ldquo;Add&rdquo;</strong> in the top-right corner — ClearLedger will appear on your home screen</> },
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 text-sm font-bold text-muted-foreground">
                {i + 1}
              </div>
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                  {step.icon}
                </div>
                <p className="text-sm text-foreground leading-relaxed">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Make sure you&apos;re using <strong>Safari</strong> — the install option isn&apos;t available in Chrome on iOS.
          </p>
        </div>
      </div>

      <div className="border-t border-border mb-8" />

      {/* Android / Chrome */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <Chrome className="w-4 h-4 text-emerald-500" />
          </div>
          <h2 className="font-semibold text-base">Android — Chrome</h2>
        </div>

        <ol className="space-y-4">
          {[
            { icon: <MoreVertical className="w-5 h-5 text-emerald-500" />, text: <>Tap the <strong>three-dot menu</strong> (&hellip;) in the top-right corner of Chrome</> },
            { icon: <PlusSquare className="w-5 h-5 text-emerald-500" />, text: <>Tap <strong>&ldquo;Add to Home screen&rdquo;</strong> or <strong>&ldquo;Install app&rdquo;</strong></> },
            { icon: <span className="text-emerald-500 font-bold text-sm">CL</span>, text: <>Tap <strong>&ldquo;Install&rdquo;</strong> — ClearLedger will open like a native app</> },
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 text-sm font-bold text-muted-foreground">
                {i + 1}
              </div>
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                  {step.icon}
                </div>
                <p className="text-sm text-foreground leading-relaxed">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <p className="text-xs text-emerald-700 dark:text-emerald-400">
            You may also see an <strong>&ldquo;Install ClearLedger&rdquo;</strong> banner at the bottom of your screen automatically.
          </p>
        </div>
      </div>
    </div>
  );
}
