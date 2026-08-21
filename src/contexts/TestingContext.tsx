import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getPublicEnv } from "@/platform/config/env";

interface TestingState {
  // Checkout Testing
  stripeTestMode: boolean;
  mockPaymentSuccess: boolean;
  mockPaymentFailure: boolean;
  
  // Admin Testing
  simulateEventData: boolean;
  simulatedEventState: 'active' | 'sold_out' | 'coming_soon' | 'ended';
  viewAsRole: 'admin' | 'user' | 'guest';
  
  // Public Site Testing
  simulateRegistrationDryRun: boolean;
  simulateEmailPreview: boolean;
  
  // General
  testingPanelOpen: boolean;
  isTestingEnabled: boolean;
}

interface TestingContextType extends TestingState {
  // Setters
  setStripeTestMode: (value: boolean) => void;
  setMockPaymentSuccess: (value: boolean) => void;
  setMockPaymentFailure: (value: boolean) => void;
  setSimulateEventData: (value: boolean) => void;
  setSimulatedEventState: (value: TestingState['simulatedEventState']) => void;
  setViewAsRole: (value: TestingState['viewAsRole']) => void;
  setSimulateRegistrationDryRun: (value: boolean) => void;
  setSimulateEmailPreview: (value: boolean) => void;
  setTestingPanelOpen: (value: boolean) => void;
  
  // Utilities
  resetAllTestingStates: () => void;
  getActiveTestFeatures: () => string[];
}

const defaultState: TestingState = {
  stripeTestMode: false,
  mockPaymentSuccess: false,
  mockPaymentFailure: false,
  simulateEventData: false,
  simulatedEventState: 'active',
  viewAsRole: 'admin',
  simulateRegistrationDryRun: false,
  simulateEmailPreview: false,
  testingPanelOpen: false,
  isTestingEnabled: import.meta.env.DEV || getPublicEnv().enableTesting,
};

const TestingContext = createContext<TestingContextType | undefined>(undefined);

const STORAGE_KEY = 'cosmico_testing_state';

export const TestingProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<TestingState>(() => {
    // Only load from storage in development
    if (import.meta.env.DEV) {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          return { ...defaultState, ...JSON.parse(stored) };
        }
      } catch (e) {
        console.warn('Failed to load testing state from storage');
      }
    }
    return defaultState;
  });

  // Persist state to localStorage in development
  useEffect(() => {
    if (import.meta.env.DEV) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (e) {
        console.warn('Failed to save testing state');
      }
    }
  }, [state]);

  const createSetter = <K extends keyof TestingState>(key: K) => {
    return (value: TestingState[K]) => {
      setState(prev => ({ ...prev, [key]: value }));
    };
  };

  const resetAllTestingStates = () => {
    setState(defaultState);
    localStorage.removeItem(STORAGE_KEY);
  };

  const getActiveTestFeatures = (): string[] => {
    const active: string[] = [];
    if (state.stripeTestMode) active.push('Stripe Test Mode');
    if (state.mockPaymentSuccess) active.push('Mock Payment Success');
    if (state.mockPaymentFailure) active.push('Mock Payment Failure');
    if (state.simulateEventData) active.push('Simulated Event Data');
    if (state.simulatedEventState !== 'active') active.push(`Event State: ${state.simulatedEventState}`);
    if (state.viewAsRole !== 'admin') active.push(`Viewing as: ${state.viewAsRole}`);
    if (state.simulateRegistrationDryRun) active.push('Registration Dry Run');
    if (state.simulateEmailPreview) active.push('Email Preview Mode');
    return active;
  };

  // Don't provide testing features in production unless explicitly enabled
  if (!state.isTestingEnabled) {
    return (
      <TestingContext.Provider value={{
        ...defaultState,
        setStripeTestMode: () => {},
        setMockPaymentSuccess: () => {},
        setMockPaymentFailure: () => {},
        setSimulateEventData: () => {},
        setSimulatedEventState: () => {},
        setViewAsRole: () => {},
        setSimulateRegistrationDryRun: () => {},
        setSimulateEmailPreview: () => {},
        setTestingPanelOpen: () => {},
        resetAllTestingStates: () => {},
        getActiveTestFeatures: () => [],
      }}>
        {children}
      </TestingContext.Provider>
    );
  }

  return (
    <TestingContext.Provider value={{
      ...state,
      setStripeTestMode: createSetter('stripeTestMode'),
      setMockPaymentSuccess: createSetter('mockPaymentSuccess'),
      setMockPaymentFailure: createSetter('mockPaymentFailure'),
      setSimulateEventData: createSetter('simulateEventData'),
      setSimulatedEventState: createSetter('simulatedEventState'),
      setViewAsRole: createSetter('viewAsRole'),
      setSimulateRegistrationDryRun: createSetter('simulateRegistrationDryRun'),
      setSimulateEmailPreview: createSetter('simulateEmailPreview'),
      setTestingPanelOpen: createSetter('testingPanelOpen'),
      resetAllTestingStates,
      getActiveTestFeatures,
    }}>
      {children}
    </TestingContext.Provider>
  );
};

export const useTesting = () => {
  const context = useContext(TestingContext);
  if (context === undefined) {
    throw new Error('useTesting must be used within a TestingProvider');
  }
  return context;
};

// Hook for checking if any test features are active (useful for showing warnings)
export const useActiveTestFeatures = () => {
  const { getActiveTestFeatures, isTestingEnabled } = useTesting();
  return {
    isTestingEnabled,
    activeFeatures: getActiveTestFeatures(),
    hasActiveFeatures: getActiveTestFeatures().length > 0,
  };
};
