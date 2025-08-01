// Core UI Components
export { Button } from './Button';
export type { ButtonProps } from './Button';

export { Alert } from './Alert';
export type { AlertProps } from './Alert';

export { Badge } from './Badge';
export type { BadgeProps } from './Badge';

export { Input } from './input';
export type { InputProps } from './input';

export { Textarea } from './Textarea';
export type { TextareaProps } from './Textarea';

// Simple HTML select
export { Select as SimpleSelect } from './select-simple';
export type { SelectProps as SimpleSelectProps } from './select-simple';

// Radix UI select
export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
} from './select';

export { Label } from './Label';
export type { LabelProps } from './Label';

export { FormField } from './FormField';
export type { FormFieldProps } from './FormField';

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './card';
export type { CardProps } from './card';

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption } from './Table';

export { SearchInput } from './SearchInput';
export type { SearchInputProps } from './SearchInput';

export { FilterTags } from './FilterTags';
export type { FilterTagsProps, FilterTag } from './FilterTags';

export { AlphabetFilter } from './AlphabetFilter';
export type { AlphabetFilterProps } from './AlphabetFilter';

export { Pagination } from './Pagination';
export type { PaginationProps } from './Pagination';

export { LoadingSpinner, LoadingState, LoadingSkeleton } from './LoadingSpinner';
export type { LoadingSpinnerProps } from './LoadingSpinner';

export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';

export { Navigation, Breadcrumbs } from './Navigation';
export type { NavigationProps, NavigationItem } from './Navigation';

export { Container } from './Container';
export type { ContainerProps } from './Container';

// Dictionary-specific components
export { DictionaryEntry } from './DictionaryEntry';
export type { DictionaryEntryProps } from './DictionaryEntry';

export { DictionaryTable } from './DictionaryTable';
export type { DictionaryTableProps } from './DictionaryTable';

export { TranslationInterface } from './TranslationInterface';
export type { TranslationInterfaceProps } from './TranslationInterface';

// Layout components
export { PageHeader } from './PageHeader';
export type { PageHeaderProps } from './PageHeader';

export { Section } from './Section';
export type { SectionProps } from './Section';

// Dialog components
export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from './dialog';

// Dropdown Menu components
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
} from './dropdown-menu';

// Toast components
export { useToast, toast } from './use-toast';
export {
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
} from './toast';
export type { ToastProps, ToastActionElement } from './toast';

// Avatar components
export { Avatar, AvatarImage, AvatarFallback } from './avatar';

// Tabs components
export { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs';

// Switch component
export { Switch } from './switch';
export type { SwitchProps } from './switch';

// Note: Card and Input components are exported from their respective subdirectories above