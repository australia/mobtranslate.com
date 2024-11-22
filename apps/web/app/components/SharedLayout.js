'use client';

import Link from 'next/link';
import styled from 'styled-components';

const NavBar = styled.nav`
  background: #2c3e50;
  padding: 1rem 2rem;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
`;

const NavContent = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const Logo = styled(Link)`
  color: white;
  text-decoration: none;
  font-size: 1.5rem;
  font-weight: bold;
`;

const NavLinks = styled.div`
  display: flex;
  gap: 2rem;
  
  a {
    color: white;
    text-decoration: none;
    transition: color 0.3s ease;
    
    &:hover {
      color: #3498db;
    }
  }
`;

const MainContainer = styled.main`
  padding-top: 70px;
  min-height: 100vh;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
`;

export default function SharedLayout({ children }) {
  return (
    <>
      <NavBar>
        <NavContent>
          <Logo href="/">Mob Translate</Logo>
          <NavLinks>
            <Link href="/about">About</Link>
            <Link href="/contribute">Contribute</Link>
            <Link href="/dictionaries">Dictionaries</Link>
            <Link href="/contact">Contact</Link>
          </NavLinks>
        </NavContent>
      </NavBar>
      <MainContainer>
        {children}
      </MainContainer>
    </>
  );
}