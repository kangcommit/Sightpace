import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'

afterEach(cleanup)

it('exposes accessible page navigation and marks the current page', () => {
  // Arrange
  render(
    <Pagination aria-label="Trip pages">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious href="/trips?page=1" />
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="/trips?page=1">1</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationLink aria-label="Page 2" href="/trips?page=2" isActive>
            2
          </PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationNext href="/trips?page=3" />
        </PaginationItem>
      </PaginationContent>
    </Pagination>,
  )

  // Act
  const navigation = screen.getByRole('navigation', { name: 'Trip pages' })

  // Assert
  expect(navigation).toBeVisible()
  expect(screen.getByRole('link', { name: 'Go to previous page' })).toHaveAttribute(
    'href',
    '/trips?page=1',
  )
  expect(screen.getByRole('link', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('link', { name: 'Go to next page' })).toHaveAttribute(
    'href',
    '/trips?page=3',
  )
})
