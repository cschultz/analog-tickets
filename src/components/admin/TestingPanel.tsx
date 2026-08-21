import { useState } from 'react';
import { 
  FlaskConical, 
  X, 
  CreditCard, 
  Calendar, 
  Users, 
  Mail, 
  RotateCcw,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { useTesting, useActiveTestFeatures } from '@/contexts/TestingContext';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface TestingSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

const TestingSection = ({ title, icon, children, defaultOpen = false }: TestingSectionProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center justify-between w-full p-2 rounded hover:bg-amber-500/10 transition-colors">
        <div className="flex items-center gap-2 text-sm font-medium text-amber-200">
          {icon}
          {title}
        </div>
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-amber-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-amber-400" />
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-6 pr-2 pb-2 space-y-3">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
};

interface ToggleRowProps {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  variant?: 'default' | 'success' | 'danger';
}

const ToggleRow = ({ label, description, checked, onCheckedChange, variant = 'default' }: ToggleRowProps) => {
  return (
    <div className="flex items-start justify-between gap-2 py-1">
      <div className="flex-1 min-w-0">
        <Label className="text-xs text-amber-100 cursor-pointer" htmlFor={label}>
          {label}
        </Label>
        {description && (
          <p className="text-[10px] text-amber-300/60 mt-0.5">{description}</p>
        )}
      </div>
      <Switch
        id={label}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className={cn(
          "data-[state=checked]:bg-amber-500",
          variant === 'success' && "data-[state=checked]:bg-green-500",
          variant === 'danger' && "data-[state=checked]:bg-red-500"
        )}
      />
    </div>
  );
};

export const TestingPanel = () => {
  const testing = useTesting();
  const { activeFeatures, hasActiveFeatures } = useActiveTestFeatures();
  
  if (!testing.isTestingEnabled) return null;
  
  return (
    <>
      {/* Floating Toggle Button */}
      <button
        onClick={() => testing.setTestingPanelOpen(!testing.testingPanelOpen)}
        className={cn(
          "fixed bottom-4 left-4 z-50 p-3 rounded-full shadow-lg transition-all duration-200",
          "bg-amber-600 hover:bg-amber-500 text-white",
          hasActiveFeatures && "ring-2 ring-amber-300 ring-offset-2 ring-offset-gray-900"
        )}
        title="Toggle Testing Panel"
      >
        <FlaskConical className="h-5 w-5" />
        {hasActiveFeatures && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold">
            {activeFeatures.length}
          </span>
        )}
      </button>
      
      {/* Panel */}
      {testing.testingPanelOpen && (
        <div className="fixed bottom-16 left-4 z-50 w-80 max-h-[70vh] overflow-hidden rounded-lg border border-amber-500/30 bg-gray-900/95 backdrop-blur-sm shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-amber-500/20 bg-amber-900/30">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-amber-400" />
              <span className="font-semibold text-amber-100 text-sm">Testing Panel</span>
              <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-300">
                DEV
              </Badge>
            </div>
            <button
              onClick={() => testing.setTestingPanelOpen(false)}
              className="p-1 rounded hover:bg-amber-500/20 text-amber-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          
          {/* Active Features Warning */}
          {hasActiveFeatures && (
            <div className="p-2 bg-amber-500/10 border-b border-amber-500/20">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="text-[10px] text-amber-200">
                  <span className="font-medium">Active test features:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {activeFeatures.map(feature => (
                      <Badge key={feature} variant="secondary" className="text-[9px] bg-amber-500/20 text-amber-200">
                        {feature}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Content */}
          <div className="overflow-y-auto max-h-[calc(70vh-120px)] p-2 space-y-1">
            {/* Checkout Testing */}
            <TestingSection 
              title="Checkout & Payments" 
              icon={<CreditCard className="h-4 w-4" />}
              defaultOpen
            >
              <ToggleRow
                label="Stripe Test Mode"
                description="Use Stripe test API keys"
                checked={testing.stripeTestMode}
                onCheckedChange={testing.setStripeTestMode}
              />
              <ToggleRow
                label="Mock Payment Success"
                description="All payments automatically succeed"
                checked={testing.mockPaymentSuccess}
                onCheckedChange={(checked) => {
                  testing.setMockPaymentSuccess(checked);
                  if (checked) testing.setMockPaymentFailure(false);
                }}
                variant="success"
              />
              <ToggleRow
                label="Mock Payment Failure"
                description="All payments automatically fail"
                checked={testing.mockPaymentFailure}
                onCheckedChange={(checked) => {
                  testing.setMockPaymentFailure(checked);
                  if (checked) testing.setMockPaymentSuccess(false);
                }}
                variant="danger"
              />
            </TestingSection>
            
            {/* Event Simulation */}
            <TestingSection 
              title="Event Simulation" 
              icon={<Calendar className="h-4 w-4" />}
            >
              <ToggleRow
                label="Simulate Event Data"
                description="Use mock event data instead of real"
                checked={testing.simulateEventData}
                onCheckedChange={testing.setSimulateEventData}
              />
              <div className="py-1">
                <Label className="text-xs text-amber-100 mb-1 block">Event State</Label>
                <Select
                  value={testing.simulatedEventState}
                  onValueChange={(value) => testing.setSimulatedEventState(value as any)}
                >
                  <SelectTrigger className="h-8 text-xs bg-gray-800 border-amber-500/30 text-amber-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active (Normal)</SelectItem>
                    <SelectItem value="sold_out">Sold Out</SelectItem>
                    <SelectItem value="coming_soon">Coming Soon</SelectItem>
                    <SelectItem value="ended">Event Ended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </TestingSection>
            
            {/* Role Testing */}
            <TestingSection 
              title="User Roles" 
              icon={<Users className="h-4 w-4" />}
            >
              <div className="py-1">
                <Label className="text-xs text-amber-100 mb-1 block">View As Role</Label>
                <Select
                  value={testing.viewAsRole}
                  onValueChange={(value) => testing.setViewAsRole(value as any)}
                >
                  <SelectTrigger className="h-8 text-xs bg-gray-800 border-amber-500/30 text-amber-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="user">Regular User</SelectItem>
                    <SelectItem value="guest">Guest (Unauthenticated)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-amber-300/60 mt-1">
                  Test UI visibility for different user types
                </p>
              </div>
            </TestingSection>
            
            {/* Email & Registration */}
            <TestingSection 
              title="Email & Registration" 
              icon={<Mail className="h-4 w-4" />}
            >
              <ToggleRow
                label="Registration Dry Run"
                description="Don't create actual registrations"
                checked={testing.simulateRegistrationDryRun}
                onCheckedChange={testing.setSimulateRegistrationDryRun}
              />
              <ToggleRow
                label="Email Preview Mode"
                description="Show email previews instead of sending"
                checked={testing.simulateEmailPreview}
                onCheckedChange={testing.setSimulateEmailPreview}
              />
            </TestingSection>
          </div>
          
          {/* Footer */}
          <div className="p-2 border-t border-amber-500/20 bg-gray-900/50">
            <Button
              variant="outline"
              size="sm"
              onClick={testing.resetAllTestingStates}
              className="w-full h-8 text-xs border-amber-500/30 text-amber-200 hover:bg-amber-500/10"
            >
              <RotateCcw className="h-3 w-3 mr-2" />
              Reset All Test Settings
            </Button>
          </div>
        </div>
      )}
    </>
  );
};

// Small indicator component for showing active test mode in headers
export const TestModeIndicator = () => {
  const { hasActiveFeatures, activeFeatures } = useActiveTestFeatures();
  const { setTestingPanelOpen, isTestingEnabled } = useTesting();
  
  if (!isTestingEnabled || !hasActiveFeatures) return null;
  
  return (
    <button
      onClick={() => setTestingPanelOpen(true)}
      className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs hover:bg-amber-500/30 transition-colors"
    >
      <FlaskConical className="h-3 w-3" />
      <span className="font-medium">Test Mode</span>
      <Badge variant="secondary" className="h-4 px-1 text-[10px] bg-amber-500/30">
        {activeFeatures.length}
      </Badge>
    </button>
  );
};
