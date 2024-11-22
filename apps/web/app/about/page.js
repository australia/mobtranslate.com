'use client';

import styled from 'styled-components';
import SharedLayout from '../components/SharedLayout';

const AboutContainer = styled.div`
  max-width: 800px;
  margin: 2rem auto;
  padding: 2rem;
  background: white;
  border-radius: 10px;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
`;

const Title = styled.h1`
  font-size: 2.5rem;
  color: #2c3e50;
  margin-bottom: 1.5rem;
`;

const Section = styled.div`
  margin-bottom: 2rem;
  
  h2 {
    font-size: 1.5rem;
    color: #34495e;
    margin-bottom: 1rem;
  }
  
  p {
    font-size: 1.1rem;
    line-height: 1.6;
    color: #2c3e50;
    margin-bottom: 1rem;
  }

  ul {
    list-style-type: disc;
    margin-left: 1.5rem;
    margin-bottom: 1rem;
  }

  li {
    font-size: 1.1rem;
    line-height: 1.6;
    color: #2c3e50;
    margin-bottom: 0.5rem;
  }
`;

const Link = styled.a`
  color: #3498db;
  text-decoration: none;
  transition: color 0.3s ease;
  
  &:hover {
    color: #2980b9;
  }
`;

export default function About() {
  return (
    <SharedLayout>
      <AboutContainer>
        <Title>About Mob Translate</Title>
        
        <Section>
          <p>
            Mob Translate is a community-driven project aimed at creating translation tools for Australian Aboriginal languages.
            Our mission is to make language preservation and learning accessible to all through open-source technology.
          </p>
        </Section>

        <Section>
          <h2>Project Goals</h2>
          <ul>
            <li>Create an open-source ecosystem for indigenous language translation</li>
            <li>Build a "Google Translate" equivalent for Australian Aboriginal languages</li>
            <li>Preserve and promote indigenous languages through technology</li>
            <li>Foster community collaboration in language documentation</li>
          </ul>
        </Section>

        <Section>
          <h2>Current Features</h2>
          <ul>
            <li>Dictionary support for multiple indigenous languages</li>
            <li>Modern, accessible web interface</li>
            <li>Community contribution system</li>
            <li>Integration with language learning tools</li>
          </ul>
        </Section>

        <Section>
          <h2>Get Involved</h2>
          <p>
            We welcome contributions from developers, linguists, and community members. Visit our{' '}
            <Link href="https://github.com/australia/mobtranslate.com" target="_blank" rel="noopener noreferrer">
              GitHub repository
            </Link>
            {' '}to learn how you can help make indigenous language translation more accessible.
          </p>
        </Section>
      </AboutContainer>
    </SharedLayout>
  );
}
