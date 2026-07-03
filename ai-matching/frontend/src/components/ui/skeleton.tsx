import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-xl bg-white/[0.06] shimmer', className)}
      {...props}
    />
  );
}

export { Skeleton };
