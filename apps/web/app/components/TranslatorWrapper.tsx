'use client';

import React from 'react';
import Translator from './Translator';
import { Language } from '@/lib/supabase/types';

interface TranslatorWrapperProps {
  languages: Language[];
}

export default function TranslatorWrapper({ languages }: TranslatorWrapperProps) {
  return <Translator availableLanguages={languages} />;
}