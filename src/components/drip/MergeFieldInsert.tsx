/**
 * MergeFieldInsert - Legacy wrapper around MergeFieldPicker for drip sequences
 * 
 * This component is maintained for backward compatibility.
 * New code should use MergeFieldPicker directly.
 */

import { MergeFieldPicker } from "@/components/email/MergeFieldPicker";

interface MergeFieldInsertProps {
  onInsert: (field: string) => void;
}

export const MergeFieldInsert = ({ onInsert }: MergeFieldInsertProps) => {
  return (
    <MergeFieldPicker
      onInsert={onInsert}
      audience="customer"
      buttonText="Insert Field"
    />
  );
};
