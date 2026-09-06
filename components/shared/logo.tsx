import Image from 'next/image'

interface LogoProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
  /** Show only the icon without text */
  iconOnly?: boolean
}

// Bumped up across the board — the mark reads as proper branding now rather
// than a favicon. `sm` still clears the sidebar's 64px header row with room to
// spare; `lg` gives the landing page a real hero mark.
const ICON_SIZES = { sm: 44, md: 64, lg: 112 }

export function Logo({ size = 'md', className, iconOnly: _iconOnly = false }: LogoProps) {
  const px = ICON_SIZES[size]
  return (
    <Image
      src="/images/logo.png"
      alt="iSched"
      width={px}
      height={px}
      className={className}
      priority
    />
  )
}
