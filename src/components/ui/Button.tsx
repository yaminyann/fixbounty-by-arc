import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { Spinner } from '@/components/ui/Feedback'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark' | 'accent'
type Size = 'sm' | 'md' | 'lg'

const BASE =
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md border font-medium transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50'

const VARIANTS: Record<Variant, string> = {
  primary: 'on-ink border-ink bg-ink text-white hover:bg-neutral-800',
  dark: 'on-ink border-ink bg-ink text-white hover:bg-neutral-800',
  // The brand yellow is kept for the single most important action on a screen.
  accent: 'border-signal-deep/60 bg-signal text-ink hover:bg-signal-deep',
  secondary: 'border-line bg-surface text-ink hover:border-ink/30 hover:bg-paper',
  ghost: 'border-transparent bg-transparent text-ink hover:bg-ink/5',
  danger: 'border-danger/40 bg-surface text-danger hover:bg-danger-soft',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-9 px-4 text-sm',
  lg: 'h-11 px-5 text-sm',
}

export function buttonClasses(variant: Variant = 'secondary', size: Size = 'md', extra?: string): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], extra)
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClasses(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={16} /> : icon}
      {children}
    </button>
  )
})

interface ButtonLinkProps extends LinkProps {
  variant?: Variant
  size?: Size
  icon?: ReactNode
}

export function ButtonLink({ variant = 'secondary', size = 'md', icon, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClasses(variant, size, className)} {...rest}>
      {icon}
      {children}
    </Link>
  )
}

interface ExternalLinkProps {
  href: string
  children: ReactNode
  className?: string
}

/** Plain text link that opens off-site safely. */
export function ExternalLink({ href, children, className }: ExternalLinkProps) {
  const safe = /^https?:\/\//i.test(href) ? href : '#'
  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={cn('break-all font-medium underline decoration-ink/30 underline-offset-2 hover:decoration-ink', className)}
    >
      {children}
    </a>
  )
}
