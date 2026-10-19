import { cn } from '@/lib/utils'

/**
 * Plain `<select>` styled like `Input`: the planning forms are dense (a row per
 * user), and the native control is the better choice on phones.
 */
export function NativeSelect({ className, ...props }: React.ComponentProps<'select'>): React.JSX.Element {
  return (
    <select
      className={cn(
        'h-8 w-full min-w-0 rounded-none border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  )
}
