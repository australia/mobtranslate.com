'use client';

import React from 'react';
import SharedLayout from '../components/SharedLayout';
import { PageHeader, Section } from '@ui/components';
import { Calendar, Globe, Heart, Users, Code, Lightbulb, Trophy, Target } from 'lucide-react';

export default function HistoryPage() {
  return (
    <SharedLayout>
      <div className="max-w-4xl mx-auto">
        <PageHeader
          title="Our History"
          description="The story of MobTranslate.com - preserving Indigenous languages through technology"
        />

        <div className="space-y-12">
          {/* Mission Statement */}
          <Section>
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-8 border border-blue-100">
              <div className="flex items-start space-x-4">
                <Heart className="h-8 w-8 text-red-500 mt-1 flex-shrink-0" />
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">Our Mission</h2>
                  <p className="text-lg text-gray-700 leading-relaxed">
                    MobTranslate.com is a community-driven project dedicated to preserving and promoting 
                    Australian Aboriginal languages through accessible translation tools and modern technology. 
                    We believe that every language deserves to thrive in the digital age.
                  </p>
                </div>
              </div>
            </div>
          </Section>

          {/* Timeline */}
          <Section>
            <h2 className="text-3xl font-bold text-gray-900 mb-8 flex items-center">
              <Calendar className="h-8 w-8 mr-3 text-blue-500" />
              Our Journey
            </h2>
            
            <div className="space-y-8">
              {/* 2023 - Foundation */}
              <div className="flex items-start space-x-6">
                <div className="flex-shrink-0 w-4 h-4 bg-blue-500 rounded-full mt-2"></div>
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className="text-xl font-semibold text-gray-900">December 2023</h3>
                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-sm font-medium">Foundation</span>
                  </div>
                  <p className="text-gray-700">
                    <strong>Thomas Davis</strong> created MobTranslate.com with a vision to build an open-source 
                    ecosystem for Indigenous language translation. The initial commit laid the foundation for 
                    what would become a comprehensive language preservation platform.
                  </p>
                </div>
              </div>

              {/* Early 2024 - Core Development */}
              <div className="flex items-start space-x-6">
                <div className="flex-shrink-0 w-4 h-4 bg-green-500 rounded-full mt-2"></div>
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className="text-xl font-semibold text-gray-900">Early-Mid 2024</h3>
                    <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-sm font-medium">Core Development</span>
                  </div>
                  <p className="text-gray-700">
                    Intensive development phase focused on building the core translation functionality. 
                    The platform began with support for <strong>Kuku Yalanji</strong>, a language from Far North Queensland, 
                    establishing the technical foundation for future language additions.
                  </p>
                </div>
              </div>

              {/* Version 0.2.0 */}
              <div className="flex items-start space-x-6">
                <div className="flex-shrink-0 w-4 h-4 bg-purple-500 rounded-full mt-2"></div>
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className="text-xl font-semibold text-gray-900">February 2025</h3>
                    <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-sm font-medium">Version 0.2.0</span>
                  </div>
                  <p className="text-gray-700">
                    Major milestone with complete TypeScript conversion, Tailwind CSS implementation, 
                    SEO-optimized dictionary pages, responsive UI improvements, and dark mode support. 
                    The platform evolved into a modern, user-friendly experience.
                  </p>
                </div>
              </div>

              {/* 2025 - AI Integration */}
              <div className="flex items-start space-x-6">
                <div className="flex-shrink-0 w-4 h-4 bg-yellow-500 rounded-full mt-2"></div>
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className="text-xl font-semibold text-gray-900">2025</h3>
                    <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full text-sm font-medium">AI Revolution</span>
                  </div>
                  <p className="text-gray-700">
                    Revolutionary updates including AI-powered translation using OpenAI GPT-4o-mini, 
                    vector embeddings for semantic word search, comprehensive spaced repetition learning system, 
                    user authentication, progress tracking, image analysis capabilities, and comprehensive 
                    dashboard and leaderboard systems.
                  </p>
                </div>
              </div>
            </div>
          </Section>

          {/* Languages Supported */}
          <Section>
            <h2 className="text-3xl font-bold text-gray-900 mb-8 flex items-center">
              <Globe className="h-8 w-8 mr-3 text-green-500" />
              Languages We Support
            </h2>
            
            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Kuku Yalanji</h3>
                <p className="text-gray-600 text-sm mb-3">Far North Queensland, Australia</p>
                <p className="text-gray-700">Our founding language, spoken by the Kuku Yalanji people of the rainforest regions.</p>
              </div>
              
              <div className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Mi'gmaq</h3>
                <p className="text-gray-600 text-sm mb-3">Eastern Canada</p>
                <p className="text-gray-700">An Indigenous language from Eastern Canada, expanding our reach across continents.</p>
              </div>
              
              <div className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Anindilyakwa</h3>
                <p className="text-gray-600 text-sm mb-3">Northern Territory, Australia</p>
                <p className="text-gray-700">Spoken on Groote Eylandt, representing the unique languages of Australia's north.</p>
              </div>
            </div>
          </Section>

          {/* Technical Evolution */}
          <Section>
            <h2 className="text-3xl font-bold text-gray-900 mb-8 flex items-center">
              <Code className="h-8 w-8 mr-3 text-purple-500" />
              Technical Innovation
            </h2>
            
            <div className="bg-gray-50 rounded-lg p-8">
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
                    <Lightbulb className="h-5 w-5 mr-2 text-yellow-500" />
                    Modern Architecture
                  </h3>
                  <ul className="space-y-2 text-gray-700">
                    <li>• Next.js 14 with TypeScript</li>
                    <li>• Turborepo monorepo setup</li>
                    <li>• Supabase backend services</li>
                    <li>• Tailwind CSS styling</li>
                    <li>• Server-side rendering for SEO</li>
                  </ul>
                </div>
                
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
                    <Target className="h-5 w-5 mr-2 text-green-500" />
                    AI Integration
                  </h3>
                  <ul className="space-y-2 text-gray-700">
                    <li>• OpenAI GPT-4o-mini translation</li>
                    <li>• Vector embeddings for search</li>
                    <li>• Image analysis capabilities</li>
                    <li>• Semantic word matching</li>
                    <li>• Intelligent learning systems</li>
                  </ul>
                </div>
              </div>
            </div>
          </Section>

          {/* Community Impact */}
          <Section>
            <h2 className="text-3xl font-bold text-gray-900 mb-8 flex items-center">
              <Users className="h-8 w-8 mr-3 text-blue-500" />
              Community & Impact
            </h2>
            
            <div className="prose prose-lg max-w-none text-gray-700">
              <p className="mb-6">
                MobTranslate.com is more than just a translation tool—it's a bridge between traditional knowledge 
                and modern technology. We work closely with Aboriginal communities and language authorities, 
                always respecting cultural protocols around language sharing.
              </p>
              
              <p className="mb-6">
                Our open-source approach ensures that the tools we build can be adapted and used by communities 
                worldwide. Every feature we develop is designed to support community-led language revitalization 
                initiatives.
              </p>
              
              <div className="bg-blue-50 border-l-4 border-blue-400 p-6 my-8">
                <p className="text-blue-800 font-medium">
                  "Technology should serve communities, not the other way around. MobTranslate.com exists 
                  to empower Indigenous communities with the digital tools they need to keep their languages alive."
                </p>
                <p className="text-blue-600 text-sm mt-2">— Thomas Davis, Founder</p>
              </div>
            </div>
          </Section>

          {/* Future Vision */}
          <Section>
            <h2 className="text-3xl font-bold text-gray-900 mb-8 flex items-center">
              <Trophy className="h-8 w-8 mr-3 text-yellow-500" />
              Looking Forward
            </h2>
            
            <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg p-8 border border-green-100">
              <p className="text-lg text-gray-800 leading-relaxed mb-4">
                As we continue to grow, our commitment remains unchanged: to provide the best possible 
                digital tools for Indigenous language preservation and learning. We're constantly working 
                on new features, expanding our language support, and improving the user experience.
              </p>
              
              <p className="text-gray-700">
                Join us on this journey. Whether you're a learner, educator, developer, or community member, 
                there's a place for you in the MobTranslate.com story.
              </p>
            </div>
          </Section>
        </div>
      </div>
    </SharedLayout>
  );
}