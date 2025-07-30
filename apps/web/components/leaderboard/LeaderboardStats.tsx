'use client';

import React from 'react';
import { Card, CardContent } from '@/app/components/ui/table';
import { 
  Trophy, 
  Users, 
  Globe, 
  TrendingUp,
  Brain,
  Target
} from 'lucide-react';

interface LeaderboardStatsProps {
  totalLanguages: number;
  totalParticipants: number;
  totalQuestions: number;
  averageAccuracy: number;
  className?: string;
}

export default function LeaderboardStats({
  totalLanguages,
  totalParticipants,
  totalQuestions,
  averageAccuracy,
  className = ''
}: LeaderboardStatsProps) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 ${className}`}>
      <Card className="bg-gradient-to-r from-blue-500 to-purple-600 text-white">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm">Active Languages</p>
              <p className="text-2xl font-bold">{totalLanguages}</p>
            </div>
            <Globe className="h-8 w-8 text-blue-200" />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-r from-green-500 to-teal-600 text-white">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm">Total Learners</p>
              <p className="text-2xl font-bold">{totalParticipants.toLocaleString()}</p>
            </div>
            <Users className="h-8 w-8 text-green-200" />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-r from-yellow-500 to-orange-600 text-white">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-yellow-100 text-sm">Questions Answered</p>
              <p className="text-2xl font-bold">{totalQuestions.toLocaleString()}</p>
            </div>
            <Brain className="h-8 w-8 text-yellow-200" />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-r from-purple-500 to-pink-600 text-white">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-100 text-sm">Global Accuracy</p>
              <p className="text-2xl font-bold">{averageAccuracy.toFixed(1)}%</p>
            </div>
            <Target className="h-8 w-8 text-purple-200" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}