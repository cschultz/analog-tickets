import React, { ReactElement } from 'react';
import { render as rtlRender, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TestingProvider } from '@/contexts/TestingContext';

// Create a fresh QueryClient for each test
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });

interface WrapperProps {
  children: React.ReactNode;
}

// All providers wrapper for full integration tests
const AllProviders = ({ children }: WrapperProps) => {
  const queryClient = createTestQueryClient();
  
  return (
    <QueryClientProvider client={queryClient}>
      <TestingProvider>
        <TooltipProvider>
          <BrowserRouter>
            {children}
          </BrowserRouter>
        </TooltipProvider>
      </TestingProvider>
    </QueryClientProvider>
  );
};

// Minimal wrapper for unit tests
const MinimalProviders = ({ children }: WrapperProps) => {
  const queryClient = createTestQueryClient();
  
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

// Custom render with all providers
const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => rtlRender(ui, { wrapper: AllProviders, ...options });

// Minimal render for isolated unit tests
const minimalRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => rtlRender(ui, { wrapper: MinimalProviders, ...options });

// Re-export everything from testing-library
export * from '@testing-library/react';
export { customRender as render, minimalRender };
