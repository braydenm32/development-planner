// The cloud's sheets, over every screen: sign in (with a passkey, or a code by email), create an
// account, use the recovery code, keep a new code, the first upload's review, the account and its
// email for sign-in, and deleting it. Mounted once.

import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { saveFile } from '../lib/download'
import { Icon } from '../nav/icons'
import { edited } from '../projects/format'
import type { ProjectMeta } from '../projects/types'
import type { Account } from './api'
import { codeDigits, couldBeEmail } from './emailCode'
import { passkeysWork } from './passkeys'
import { cloudActions, startCloud, useCloud, type SignInReason } from './state'
import { chipLook, longDate, megabytes, projects } from './words'
import './cloud.css'

/** Where to ask for an invite code. */
const CONTACT = 'hello@contourandgable.com'

export function CloudLayer() {
  const sheet = useCloud(s => s.sheet)
  // Is there a cloud here, and who is signed in? Nothing else is sent before he signs in.
  useEffect(() => void startCloud(), [])
  if (sheet === 'sign-in') return <SignInSheet />
  if (sheet === 'create') return <CreateSheet />
  if (sheet === 'recover') return <RecoverSheet />
  if (sheet === 'code') return <CodeSheet />
  if (sheet === 'upload') return <UploadSheet />
  if (sheet === 'account') return <AccountSheet />
  if (sheet === 'delete') return <DeleteSheet />
  if (sheet === 'deleting') return <DeletingSheet />
  if (sheet === 'email') return <EmailSignInSheet />
  if (sheet === 'email-add') return <EmailAddSheet nudge={false} />
  if (sheet === 'email-nudge') return <EmailAddSheet nudge />
  if (sheet === 'passkey-offer') return <PasskeyOfferSheet />
  return null
}

// ---------------------------------------------------------------------------

function Sheet({ title, children, closable = true, wide }: { title: string; children: ReactNode; closable?: boolean; wide?: boolean }) {
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)
  const busy = useCloud(s => s.busy)
  const canClose = closable && !busy
  const close = useRef(canClose)
  useLayoutEffect(() => {
    close.current = canClose
  })
  useEffect(() => {
    const el = ref.current
    const before = document.activeElement as HTMLElement | null
    el?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      if (close.current) cloudActions.close()
    }
    document.addEventListener('keydown', esc, true)
    return () => {
      document.removeEventListener('keydown', esc, true)
      if (before?.isConnected) before.focus?.()
    }
  }, [])
  return (
    <div className="cloud-ui cl-scrim" onPointerDown={e => e.target === e.currentTarget && close.current && cloudActions.close()}>
      <div ref={ref} className={`cl-sheet${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={id}>
        <header className="cl-head">
          <h2 id={id}>{title}</h2>
          {closable && (
            <button className="cl-x" aria-label="Close" onClick={cloudActions.close} disabled={busy}>
              <Icon name="x" size={18} />
            </button>
          )}
        </header>
        <div className="cl-body">{children}</div>
      </div>
    </div>
  )
}

function Problem() {
  const problem = useCloud(s => s.problem)
  return problem ? (
    <p className="cl-problem" role="alert">
      {problem}
    </p>
  ) : null
}

const NO_PASSKEYS = 'This browser can’t use passkeys. Try an up-to-date Safari, Chrome, Edge or Firefox.'

// ---------------------------------------------------------------------------
// Signing in.

/** What the sign-in sheet leads with when something asked for it. */
const REASONS: Record<SignInReason, { title: string; lede: string }> = {
  share: {
    title: 'Sign in to share a link',
    lede: 'A view-only link opens the copy of this project saved in the cloud, so sharing one needs an account. Sign in, or make one in a minute: there’s no password, just a passkey (Face ID, Touch ID, Windows Hello or your phone).',
  },
}

function SignInSheet() {
  const busy = useCloud(s => s.busy)
  const signup = useCloud(s => s.signup)
  const email = useCloud(s => s.email)
  const reason = useCloud(s => s.reason)
  const works = passkeysWork()
  const why = reason ? REASONS[reason] : null
  const canCreate = signup !== 'closed'
  return (
    <Sheet title={why?.title ?? 'Save your projects to the cloud'}>
      <p>{why?.lede ?? 'Sign in with a passkey: Face ID, Touch ID, Windows Hello or your phone. There’s no password.'}</p>
      <ul className="cl-points">
        <li>Your projects open on your other devices, and are safe if this one is lost.</li>
        <li>They stay on this device too, and keep working offline.</li>
      </ul>
      {!works && <p className="cl-problem">{NO_PASSKEYS}</p>}
      <Problem />
      {/* Sign in and Create account side by side, the same size: a first visit is as likely as a return. */}
      <div className={`cl-actions${canCreate ? ' pair' : ''}`}>
        <button className="cl-btn primary big" data-autofocus disabled={busy || !works} onClick={() => void cloudActions.signIn()}>
          <Icon name="key" size={18} />
          {busy ? 'Waiting for your passkey…' : 'Sign in with a passkey'}
        </button>
        {canCreate && (
          <button className="cl-btn big" disabled={busy} onClick={() => cloudActions.open('create')}>
            <Icon name="plus" size={18} />
            Create an account
          </button>
        )}
      </div>
      {email && (
        <p className="cl-instead">
          <button className="cl-link" onClick={() => cloudActions.open('email')} disabled={busy}>
            <Icon name="mail" size={16} />
            Email me a code instead
          </button>
        </p>
      )}
      <p className="cl-alt">
        <span>
          Lost your passkey?{' '}
          <button className="cl-link" onClick={() => cloudActions.open('recover')} disabled={busy}>
            Use your recovery code
          </button>
        </span>
      </p>
    </Sheet>
  )
}

function CreateSheet() {
  const busy = useCloud(s => s.busy)
  const signup = useCloud(s => s.signup)
  const [name, setName] = useState('')
  const [invite, setInvite] = useState('')
  const works = passkeysWork()
  const ready = name.trim().length > 0 && (signup !== 'invite' || invite.trim().length > 0)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (ready && !busy) void cloudActions.createAccount(name.trim(), signup === 'invite' ? invite.trim() : undefined)
  }
  return (
    <Sheet title="Create your account">
      <form onSubmit={submit}>
        <p>This device makes a passkey for the planner and keeps it behind Face ID, your fingerprint, your PIN or Windows Hello. Phones and Macs share it with your other devices.</p>
        <label className="cl-field">
          <span>Your name</span>
          <input data-autofocus value={name} onChange={e => setName(e.target.value)} autoComplete="name" maxLength={60} disabled={busy} />
          <small>Shown on your passkey, so it’s easy to pick.</small>
        </label>
        {signup === 'invite' && (
          <label className="cl-field">
            <span>Invite code</span>
            <input value={invite} onChange={e => setInvite(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} disabled={busy} />
            <small>
              Don’t have a code? Email <a href={`mailto:${CONTACT}?subject=${encodeURIComponent('An invite code for Contour & Gable')}`}>{CONTACT}</a>
            </small>
          </label>
        )}
        {!works && <p className="cl-problem">{NO_PASSKEYS}</p>}
        <Problem />
        {/* In tabs of their own, so what's typed here is still here when you come back. */}
        <p className="cl-agree">
          By creating an account you agree to the{' '}
          <a href="#/terms" target="_blank" rel="noopener">
            Terms
          </a>{' '}
          and{' '}
          <a href="#/privacy" target="_blank" rel="noopener">
            Privacy policy
          </a>
          .
        </p>
        <div className="cl-actions">
          <button type="submit" className="cl-btn primary big" disabled={busy || !ready || !works}>
            <Icon name="key" size={18} />
            {busy ? 'Waiting for your passkey…' : 'Create a passkey'}
          </button>
        </div>
        <p className="cl-alt">
          <span>
            Already have an account?{' '}
            <button type="button" className="cl-link" onClick={() => cloudActions.open('sign-in')} disabled={busy}>
              Sign in
            </button>
          </span>
        </p>
      </form>
    </Sheet>
  )
}

function RecoverSheet() {
  const busy = useCloud(s => s.busy)
  const [code, setCode] = useState('')
  const ready = code.replace(/[^0-9a-z]/gi, '').length >= 20
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (ready && !busy) void cloudActions.recover(code)
  }
  return (
    <Sheet title="Use your recovery code">
      <form onSubmit={submit}>
        <p>Lost your passkeys? Your recovery code lets you make a new passkey on this device. You’ll get a new code after, and the old one stops working.</p>
        <label className="cl-field">
          <span>Recovery code</span>
          <input
            data-autofocus
            className="cl-code-input"
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={40}
            disabled={busy}
          />
        </label>
        <Problem />
        <div className="cl-actions">
          <button type="submit" className="cl-btn primary big" disabled={busy || !ready}>
            <Icon name="key" size={18} />
            {busy ? 'Waiting for your passkey…' : 'Make a new passkey'}
          </button>
        </div>
        <p className="cl-alt">
          <span>
            <button type="button" className="cl-link" onClick={() => cloudActions.open('sign-in')} disabled={busy}>
              Back to sign in
            </button>
          </span>
        </p>
      </form>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Email: the backup to passkeys. Signed out, a 6-digit code to the account's address signs in;
// signed in, an address is added once a code sent to it is typed in. Both start with the address,
// then take the code.

function EmailField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const busy = useCloud(s => s.busy)
  return (
    <label className="cl-field">
      <span>Email address</span>
      <input
        type="email"
        autoFocus
        value={value}
        onChange={e => onChange(e.target.value)}
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={254}
        readOnly={busy}
      />
    </label>
  )
}

/** The code: six digits, typed, pasted in any shape or filled in from the email by the phone. Sends itself once whole. */
function CodeStep({ lede, label, onCode, onResend, onOther }: { lede: ReactNode; label: string; onCode: (code: string) => Promise<boolean>; onResend: () => Promise<boolean>; onOther: () => void }) {
  const busy = useCloud(s => s.busy)
  const [code, setCode] = useState('')
  const [resent, setResent] = useState(false)
  const submit = (value: string) => {
    if (!busy && value.length === 6) void onCode(value)
  }
  const resend = async () => {
    if (!(await onResend())) return
    setCode('')
    setResent(true)
  }
  return (
    <form
      onSubmit={e => {
        e.preventDefault()
        submit(code)
      }}
    >
      <p>{lede}</p>
      <label className="cl-field">
        <span>6-digit code</span>
        <input
          autoFocus
          className="cl-otp"
          value={code}
          onChange={e => {
            const digits = codeDigits(e.target.value)
            setCode(digits)
            if (digits.length === 6 && code.length < 6) submit(digits)
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          spellCheck={false}
          readOnly={busy}
        />
      </label>
      {resent && (
        <p className="cl-muted" role="status">
          A new code is on its way. The one before it no longer works.
        </p>
      )}
      <Problem />
      <div className="cl-actions">
        <button type="submit" className="cl-btn primary big" disabled={busy || code.length !== 6}>
          {busy ? 'Checking…' : label}
        </button>
      </div>
      <p className="cl-alt">
        <span>
          No email?{' '}
          <button type="button" className="cl-link" onClick={() => void resend()} disabled={busy}>
            Send a new code
          </button>
        </span>
        <span>
          <button type="button" className="cl-link" onClick={onOther} disabled={busy}>
            Use another email
          </button>
        </span>
      </p>
    </form>
  )
}

function EmailSignInSheet() {
  const busy = useCloud(s => s.busy)
  const [address, setAddress] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const ready = couldBeEmail(address)
  const send = async (e: FormEvent) => {
    e.preventDefault()
    if (ready && !busy && (await cloudActions.emailCode(address))) setSentTo(address.trim())
  }
  return (
    <Sheet title="Sign in with an email code">
      {sentTo === null ? (
        <form onSubmit={e => void send(e)}>
          <p>Lost your passkey, or on a new device? We’ll email you a 6-digit code, if you’ve added this email to your account.</p>
          <EmailField value={address} onChange={setAddress} />
          <Problem />
          <div className="cl-actions">
            <button type="submit" className="cl-btn primary big" disabled={busy || !ready}>
              <Icon name="mail" size={18} />
              {busy ? 'Sending…' : 'Email me a code'}
            </button>
          </div>
        </form>
      ) : (
        <CodeStep
          lede={
            <>
              If an account has <b className="cl-email">{sentTo}</b>, we’ve emailed it a code. It works for 10 minutes. Not there in a minute? Check your spam folder.
            </>
          }
          label="Sign in"
          onCode={code => cloudActions.emailSignIn(sentTo, code)}
          onResend={() => cloudActions.emailCode(sentTo)}
          onOther={() => setSentTo(null)}
        />
      )}
      <p className="cl-alt">
        <span>
          <button type="button" className="cl-link" onClick={() => cloudActions.open('sign-in')} disabled={busy}>
            Back to sign in
          </button>
        </span>
        <span>
          No email added?{' '}
          <button type="button" className="cl-link" onClick={() => cloudActions.open('recover')} disabled={busy}>
            Use your recovery code
          </button>
        </span>
      </p>
    </Sheet>
  )
}

/** Add (or change) the account's email: from the account sheet, or the one ask after creating an account (`nudge`). */
function EmailAddSheet({ nudge }: { nudge: boolean }) {
  const busy = useCloud(s => s.busy)
  const [address, setAddress] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const ready = couldBeEmail(address)
  const send = async (e: FormEvent) => {
    e.preventDefault()
    if (!ready || busy) return
    const kept = await cloudActions.addEmail(address)
    if (kept) setSentTo(kept)
  }
  const leave = () => (nudge ? cloudActions.close() : cloudActions.open('account'))
  return (
    <Sheet title={nudge ? 'Add an email, just in case' : 'Email for sign-in'}>
      {sentTo === null ? (
        <form onSubmit={e => void send(e)}>
          <p>{nudge ? 'Add an email so you can get back in if you lose this device.' : 'If you lose your passkeys, we can email you a code to sign in.'} We’ll send it a code first, to check it’s yours.</p>
          <EmailField value={address} onChange={setAddress} />
          <p className="cl-agree">
            Used only to send you sign-in codes, through Resend.{' '}
            <a href="#/privacy" target="_blank" rel="noopener">
              Privacy policy
            </a>
          </p>
          <Problem />
          <div className="cl-actions split">
            <button type="button" className="cl-btn" onClick={leave} disabled={busy}>
              {nudge ? 'Not now' : 'Cancel'}
            </button>
            <button type="submit" className="cl-btn primary" disabled={busy || !ready}>
              <Icon name="mail" size={17} />
              {busy ? 'Sending…' : 'Email me a code'}
            </button>
          </div>
        </form>
      ) : (
        <CodeStep
          lede={
            <>
              We’ve emailed a code to <b className="cl-email">{sentTo}</b>. It works for 10 minutes.
            </>
          }
          label="Add this email"
          onCode={code => cloudActions.confirmEmail(sentTo, code)}
          onResend={async () => !!(await cloudActions.addEmail(sentTo))}
          onOther={() => setSentTo(null)}
        />
      )}
    </Sheet>
  )
}

/** After signing in by email: a passkey on this device, so next time is quicker. */
function PasskeyOfferSheet() {
  const busy = useCloud(s => s.busy)
  const add = async () => {
    if (await cloudActions.addPasskey()) cloudActions.close()
  }
  return (
    <Sheet title="Add a passkey on this device?">
      <p>You’re signed in. With a passkey here, next time it’s Face ID, your fingerprint, your PIN or Windows Hello, with no email to wait for.</p>
      <Problem />
      <div className="cl-actions split">
        <button className="cl-btn" onClick={cloudActions.close} disabled={busy}>
          Not now
        </button>
        <button className="cl-btn primary" data-autofocus onClick={() => void add()} disabled={busy}>
          <Icon name="key" size={17} />
          {busy ? 'Waiting for your passkey…' : 'Add a passkey'}
        </button>
      </div>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// The recovery code, shown once.

function CodeSheet() {
  const code = useCloud(s => s.code)
  const user = useCloud(s => s.user)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  if (!code) return null
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code.value)
      setCopied(true)
    } catch {
      // Select it instead, so it can be copied by hand.
      const range = document.createRange()
      const el = document.querySelector('.cl-code code')
      if (el) {
        range.selectNodeContents(el)
        getSelection()?.removeAllRanges()
        getSelection()?.addRange(range)
      }
    }
  }
  const download = () =>
    saveFile(
      'contour-and-gable-recovery-code.txt',
      [
        'Contour & Gable: recovery code',
        '',
        code.value,
        '',
        `For ${user?.name ?? 'your account'}, made ${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}, at ${location.origin}.`,
        'If you lose your passkeys, choose Sign in, then "Use your recovery code".',
        'It works once: you get a new code after.',
        '',
      ].join('\n'),
      'text/plain',
    )
  return (
    <Sheet title={code.first ? 'Keep your recovery code' : 'Your new recovery code'} closable={false}>
      <p>
        {code.first ? 'You’re signed in. ' : 'Your old recovery code no longer works. '}
        If you ever lose your passkeys (a new phone, a reset computer), this code gets you back in. It’s shown only this once.
      </p>
      <div className="cl-code">
        <code aria-label="Recovery code">{code.value}</code>
      </div>
      <div className="cl-code-actions">
        <button className="cl-btn" onClick={() => void copy()}>
          <Icon name={copied ? 'check' : 'copy'} size={16} />
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button className="cl-btn" onClick={download}>
          <Icon name="download" size={16} />
          Download
        </button>
      </div>
      <p className="cl-muted">Keep it somewhere safe that isn’t only this device: a password manager, or written down at home.</p>
      <label className="cl-check">
        <input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} />
        <span>I’ve saved my recovery code</span>
      </label>
      <div className="cl-actions">
        <button className="cl-btn primary big" disabled={!saved} onClick={cloudActions.close}>
          Done
        </button>
      </div>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// The first upload's review: nothing made here before signing in goes up without asking.

function UploadSheet() {
  const waiting = useCloud(s => s.waiting)
  const kept = useCloud(s => s.kept)
  const [list] = useState<ProjectMeta[]>(() => [...waiting, ...kept].sort((a, b) => b.updated - a.updated))
  const [picked, setPicked] = useState<Set<string>>(() => new Set(list.filter(m => !m.archived).map(m => m.id)))
  const toggle = (id: string, on: boolean) =>
    setPicked(p => {
      const next = new Set(p)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  const rest = list.filter(m => !picked.has(m.id)).map(m => m.id)
  return (
    <Sheet title={list.length === 1 ? 'Save this project to the cloud?' : 'Save these projects to the cloud?'} wide>
      <p>
        {list.length === 1
          ? 'This project is on this device only. Save it to your account, and it opens on your other devices too. If not, it stays here, and you can upload it later from All projects.'
          : `These ${list.length} projects are on this device only. Tick the ones to save to your account, so they open on your other devices too. The rest stay here, and you can upload them later from All projects.`}
      </p>
      <ul className="cl-pick">
        {list.map(m => (
          <li key={m.id}>
            <label>
              <input type="checkbox" checked={picked.has(m.id)} onChange={e => toggle(m.id, e.target.checked)} />
              <span className="cl-pick-text">
                <b>{m.name}</b>
                <span>
                  Edited {edited(m.updated)}
                  {m.surveyFileName ? ` · ${m.surveyFileName}` : ''}
                  {m.archived ? ' · Archived' : ''}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="cl-actions split">
        <button className="cl-btn" onClick={() => void cloudActions.keepHere(list.map(m => m.id))}>
          Not now
        </button>
        <button className="cl-btn primary" data-autofocus disabled={!picked.size} onClick={() => void cloudActions.upload([...picked], rest)}>
          <Icon name="cloud" size={17} />
          Upload {projects(picked.size)}
        </button>
      </div>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// The account: how saving is going, space used, passkeys, the recovery code, sign out, delete.

function AccountSheet() {
  const user = useCloud(s => s.user)
  const sync = useCloud(s => s.sync)
  const busy = useCloud(s => s.busy)
  const emailOn = useCloud(s => s.email)
  const [removing, setRemoving] = useState(false)
  const localOnly = useCloud(s => s.waiting.length + s.kept.length)
  const [account, setAccount] = useState<Account | null>(null)
  useEffect(() => {
    let live = true
    cloudActions.account().then(
      a => live && setAccount(a),
      () => {},
    )
    return () => {
      live = false
    }
  }, [])
  const anyInCloud = useCloud(s => s.inCloud.length > 0)
  if (!user) return null
  const look = chipLook(sync, anyInCloud)
  const keys = account?.passkeys ?? []
  return (
    <Sheet title="Cloud saves">
      <div className="cl-who">
        <span className="cl-avatar" aria-hidden="true">
          {user.name.trim().charAt(0).toUpperCase() || '?'}
        </span>
        <span>
          <b>{user.name}</b>
          <span className="cl-muted">Signed in on this device</span>
        </span>
      </div>

      <div className={`cl-status ${look.tone}`}>
        <Icon name={look.icon} size={18} />
        <p>{look.detail}</p>
        {sync.signedOut ? (
          <button className="cl-btn" onClick={() => cloudActions.open('sign-in')}>
            Sign in
          </button>
        ) : (
          <button className="cl-btn" onClick={() => void cloudActions.syncNow()} disabled={sync.busy > 0}>
            Sync now
          </button>
        )}
      </div>

      {localOnly > 0 && (
        <p className="cl-row">
          <span>{projects(localOnly)} on this device only.</span>
          <button className="cl-link" onClick={() => cloudActions.open('upload')}>
            Review…
          </button>
        </p>
      )}

      {account?.storage && (
        <p className="cl-muted cl-space">
          Cloud space: {megabytes(account.storage.used)} of {megabytes(account.storage.limit)} used.
        </p>
      )}

      <section className="cl-section">
        <h3>Passkeys</h3>
        <p className="cl-muted">
          {account
            ? `${keys.length} passkey${keys.length === 1 ? '' : 's'}${keys.some(k => k.synced) ? ', shared across your devices by your phone or computer' : ''}. Last used ${lastUsed(keys)}.`
            : 'Your passkeys sign you in on each device.'}
        </p>
        <button className="cl-btn" onClick={() => void cloudActions.addPasskey()} disabled={busy}>
          <Icon name="key" size={16} />
          Add a passkey on this device
        </button>
      </section>

      {/* Shown where email works; and wherever an address is kept, so it can always be removed. */}
      {account && (emailOn || account.email) && (
        <section className="cl-section">
          <h3>Email for sign-in</h3>
          {account.email ? (
            <>
              <p className="cl-muted">
                <b className="cl-email">{account.email}</b>
                <br />
                {emailOn ? 'If you lose your passkeys, we can email you a code to sign in.' : 'Email codes can’t be sent here for now.'}
              </p>
              {removing ? (
                <div className="cl-inline" role="group" aria-label="Remove this email?">
                  <span>Remove this email? You’ll sign in with a passkey or your recovery code.</span>
                  <button className="cl-btn" onClick={() => setRemoving(false)} disabled={busy}>
                    Keep it
                  </button>
                  <button
                    className="cl-btn danger"
                    onClick={async () => {
                      if (await cloudActions.removeEmail()) setAccount({ ...account, email: null })
                      setRemoving(false)
                    }}
                    disabled={busy}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="cl-inline">
                  {emailOn && (
                    <button className="cl-btn" onClick={() => cloudActions.open('email-add')} disabled={busy}>
                      Change…
                    </button>
                  )}
                  <button className="cl-btn" onClick={() => setRemoving(true)} disabled={busy}>
                    Remove…
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="cl-muted">Add an email so you can get back in if you lose this device. It’s used only to send you sign-in codes.</p>
              <button className="cl-btn" onClick={() => cloudActions.open('email-add')} disabled={busy}>
                <Icon name="mail" size={16} />
                Add an email…
              </button>
            </>
          )}
        </section>
      )}

      <section className="cl-section">
        <h3>Recovery code</h3>
        <p className="cl-muted">
          {account?.recoveryCodeCreated ? `Made ${edited(account.recoveryCodeCreated)}. ` : ''}
          Lost it? Make a new one; the old one stops working.
        </p>
        <button className="cl-btn" onClick={() => void cloudActions.newRecoveryCode()} disabled={busy}>
          Make a new recovery code
        </button>
      </section>

      <Problem />
      <div className="cl-actions split">
        <p className="cl-muted">Signing out keeps your projects on this device.</p>
        <button className="cl-btn" onClick={() => void cloudActions.signOut()} disabled={busy}>
          Sign out
        </button>
      </div>

      <section className="cl-section">
        <h3>Delete account</h3>
        <p className="cl-muted">Deletes your account and everything saved in the cloud for it, 30 days after you ask.</p>
        <button className="cl-btn danger" onClick={() => cloudActions.open('delete')} disabled={busy}>
          Delete my account…
        </button>
      </section>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Deleting the account: asking (with 30 days to change your mind), and the sheet that greets
// its owner on signing in again within them.

const DELETE_DAYS = 30

function DeleteSheet() {
  const busy = useCloud(s => s.busy)
  const [when] = useState(() => longDate(Date.now() + DELETE_DAYS * 24 * 60 * 60 * 1000))
  return (
    <Sheet title="Delete your account?">
      <p>Your account and everything saved in the cloud for it will be deleted for good on {when}.</p>
      <ul className="cl-points">
        <li>You’re signed out on every device now, and your view-only links stop opening.</li>
        <li>Change your mind before then? Sign in and choose Keep my account.</li>
        <li>Projects stay on each device that has them. To keep a copy elsewhere, save a project file first.</li>
      </ul>
      <Problem />
      <div className="cl-actions split">
        <button className="cl-btn" data-autofocus onClick={() => cloudActions.open('account')} disabled={busy}>
          Cancel
        </button>
        <button className="cl-btn danger" onClick={() => void cloudActions.deleteAccount()} disabled={busy}>
          Delete my account
        </button>
      </div>
    </Sheet>
  )
}

function DeletingSheet() {
  const user = useCloud(s => s.user)
  const busy = useCloud(s => s.busy)
  if (!user?.deleteAfter) return null
  return (
    <Sheet title="Your account is being deleted" closable={false}>
      <p>
        You asked to delete this account. It will be deleted, with everything saved in the cloud for it, on {longDate(user.deleteAfter)}.
      </p>
      <p className="cl-muted">Until then nothing is saved to the cloud and your view-only links don’t open. Projects on this device stay here either way.</p>
      <Problem />
      <div className="cl-actions split">
        <button className="cl-btn" onClick={() => void cloudActions.signOut()} disabled={busy}>
          Sign out
        </button>
        <button className="cl-btn primary" data-autofocus onClick={() => void cloudActions.keepAccount()} disabled={busy}>
          Keep my account
        </button>
      </div>
    </Sheet>
  )
}

function lastUsed(keys: Account['passkeys']): string {
  const t = Math.max(0, ...keys.map(k => k.lastUsed ?? k.created))
  return t ? edited(t) : 'never'
}
