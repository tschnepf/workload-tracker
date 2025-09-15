import React from 'react'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { RouteObject } from 'react-router'
import { RouterProvider, createMemoryRouter } from 'react-router'

export function renderWithProviders(
  ui: React.ReactElement,
  opts?: { route?: string; routes?: RouteObject[] }
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const route = opts?.route ?? '/'
  const routes = opts?.routes

  if (routes && routes.length > 0) {
    const router = createMemoryRouter(routes, { initialEntries: [route] })
    return render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    )
  }

  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

