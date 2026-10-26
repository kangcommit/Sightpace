import { cn } from 'cn'
import type * as React from 'react'

function FieldGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="field-group"
      className={cn('group/field-group flex flex-col gap-5', className)}
      {...props}
    />
  )
}

function Field({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="field"
      className={cn('group/field flex w-full flex-col gap-2', className)}
      {...props}
    />
  )
}

function FieldLabel({ className, children, htmlFor, ...props }: React.ComponentProps<'label'>) {
  return (
    <label
      data-slot="field-label"
      className={cn('text-sm font-medium', className)}
      htmlFor={htmlFor}
      {...props}
    >
      {children}
    </label>
  )
}

function FieldDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="field-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  )
}

function FieldError({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p data-slot="field-error" className={cn('text-destructive text-sm', className)} {...props} />
  )
}

export { Field, FieldDescription, FieldError, FieldGroup, FieldLabel }
