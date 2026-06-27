import React from 'react';
import { SvgXml } from 'react-native-svg';

interface AssetIconProps {
  size?: number;
  color?: string;
}

// Bookmark Active (filled)
export const BookmarkActiveSvg: React.FC<AssetIconProps> = ({ size = 24, color = "#00498B" }) => {
  const svgXml = `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 17.9808V9.70753C4 6.07416 4 4.25748 5.17157 3.12874C6.34315 2 8.22876 2 12 2C15.7712 2 17.6569 2 18.8284 3.12874C20 4.25748 20 6.07416 20 9.70753V17.9808C20 20.2867 20 21.4396 19.2272 21.8523C17.7305 22.6514 14.9232 19.9852 13.59 19.1824C12.8168 18.7168 12.4302 18.484 12 18.484C11.5698 18.484 11.1832 18.7168 10.41 19.1824C9.0768 19.9852 6.26947 22.6514 4.77285 21.8523C4 21.4396 4 20.2867 4 17.9808Z" fill="${color}" stroke="${color}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
  return <SvgXml xml={svgXml} />;
};

// Star (filled)
export const StarSvg: React.FC<AssetIconProps> = ({ size = 24, color = "#FFB22D" }) => {
  const svgXml = `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M13.7276 3.44418L15.4874 6.99288C15.7274 7.48687 16.3673 7.9607 16.9073 8.05143L20.0969 8.58575C22.1367 8.92853 22.6167 10.4206 21.1468 11.8925L18.6671 14.3927C18.2471 14.8161 18.0172 15.6327 18.1471 16.2175L18.8571 19.3125C19.417 21.7623 18.1271 22.71 15.9774 21.4296L12.9877 19.6452C12.4478 19.3226 11.5579 19.3226 11.0079 19.6452L8.01827 21.4296C5.8785 22.71 4.57865 21.7522 5.13859 19.3125L5.84851 16.2175C5.97849 15.6327 5.74852 14.8161 5.32856 14.3927L2.84884 11.8925C1.389 10.4206 1.85895 8.92853 3.89872 8.58575L7.08837 8.05143C7.61831 7.9607 8.25824 7.48687 8.49821 6.99288L10.258 3.44418C11.2179 1.51861 12.7777 1.51861 13.7276 3.44418Z" fill="${color}" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
  return <SvgXml xml={svgXml} />;
};

// Sport Icon
export const SportSvg: React.FC<AssetIconProps> = ({ size = 24, color = "#364552" }) => {
  const svgXml = `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 20.0027C8.20914 20.0027 10 18.2119 10 16.0027C10 13.7936 8.20914 12.0027 6 12.0027C3.79086 12.0027 2 13.7936 2 16.0027C2 18.2119 3.79086 20.0027 6 20.0027Z" stroke="${color}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M18 20.0027C20.2091 20.0027 22 18.2119 22 16.0027C22 13.7936 20.2091 12.0027 18 12.0027C15.7909 12.0027 14 13.7936 14 16.0027C14 18.2119 15.7909 20.0027 18 20.0027Z" stroke="${color}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M6 16.0027H10.3706C10.7302 16.0027 11.0622 15.8096 11.2399 15.4969L15.5 8.00269" stroke="${color}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M12 13.0027L7 7.00269M7 7.00269H5M7 7.00269H9" stroke="${color}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M20.0039 6.21862C19.7999 5.64262 19.4399 4.74262 18.2399 4.32262C17.4599 4.02262 15.5399 3.90262 15.2999 4.08262C14.9527 4.16943 14.9399 4.56262 15.1079 5.10262C15.2444 5.68157 15.4559 6.42818 15.6479 7.14262C16.1399 8.97342 17.2199 12.9386 18.0239 15.9986" stroke="${color}" stroke-width="1.75" stroke-linecap="round"/>
    </svg>
  `;
  return <SvgXml xml={svgXml} />;
};

// Music Icon
export const MusicSvg: React.FC<AssetIconProps> = ({ size = 24, color = "#364552" }) => {
  const svgXml = `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 9.5C7 10.8807 5.88071 12 4.5 12C3.11929 12 2 10.8807 2 9.5C2 8.11929 3.11929 7 4.5 7C5.88071 7 7 8.11929 7 9.5ZM7 9.5V2C7.33333 2.5 7.6 4.6 10 5" stroke="${color}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M10.5 22C11.8807 22 13 20.8807 13 19.5C13 18.1193 11.8807 17 10.5 17C9.11929 17 8 18.1193 8 19.5C8 20.8807 9.11929 22 10.5 22Z" stroke="${color}" stroke-width="1.75"/>
      <path d="M20 20C21.1046 20 22 19.1046 22 18C22 16.8954 21.1046 16 20 16C18.8954 16 18 16.8954 18 18C18 19.1046 18.8954 20 20 20Z" stroke="${color}" stroke-width="1.75"/>
      <path d="M13 19.5001V11.0001C13 10.0901 13 9.63512 13.2466 9.35258C13.4932 9.07003 13.9938 9.00173 14.9949 8.86514C18.0085 8.45395 20.2013 7.19807 21.3696 6.42947C21.6498 6.24519 21.7898 6.15305 21.8949 6.20971C22 6.26637 22 6.43189 22 6.76293V17.926" stroke="${color}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M13 13C17.8 13 21 10.6667 22 10" stroke="${color}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
  return <SvgXml xml={svgXml} />;
};

// Culture/Community Icon
export const CultureSvg: React.FC<AssetIconProps> = ({ size = 24, color = "#364552" }) => {
  const svgXml = `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M15.5 11C15.5 9.067 13.933 7.5 12 7.5C10.067 7.5 8.5 9.067 8.5 11C8.5 12.933 10.067 14.5 12 14.5C13.933 14.5 15.5 12.933 15.5 11Z" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M15.4827 11.3499C15.8047 11.4475 16.1462 11.5 16.5 11.5C18.433 11.5 20 9.933 20 8C20 6.067 18.433 4.5 16.5 4.5C14.6851 4.5 13.1928 5.8814 13.0173 7.65013" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M10.9827 7.65013C10.8072 5.8814 9.31492 4.5 7.5 4.5C5.567 4.5 4 6.067 4 8C4 9.933 5.567 11.5 7.5 11.5C7.85381 11.5 8.19535 11.4475 8.51727 11.3499" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M22 16.5C22 13.7386 19.5376 11.5 16.5 11.5" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M17.5 19.5C17.5 16.7386 15.0376 14.5 12 14.5C8.96243 14.5 6.5 16.7386 6.5 19.5" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M7.5 11.5C4.46243 11.5 2 13.7386 2 16.5" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
  return <SvgXml xml={svgXml} />;
};

// Markets Icon
export const MarketsSvg: React.FC<AssetIconProps> = ({ size = 24, color = "#364552" }) => {
  const svgXml = `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3.5 10V15C3.5 17.8284 3.5 19.2426 4.37868 20.1213C5.25736 21 6.67157 21 9.5 21H14.5C17.3284 21 18.7427 21 19.6213 20.1213C20.5 19.2426 20.5 17.8284 20.5 15V10" stroke="${color}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M17 7.50196C17 8.88267 15.8807 10.0001 14.5 10.0001C13.1193 10.0001 12 8.8808 12 7.50009C12 8.8808 10.8807 10.0001 9.5 10.0001C8.11929 10.0001 7 8.8808 7 7.50009C7 8.8808 5.82653 10.0001 4.37899 10.0001C3.59982 10.0001 2.90007 9.67579 2.41998 9.16099C1.5946 8.27592 2.12559 6.97415 2.81446 5.98854L3.202 5.45863C4.08384 4.25282 4.52476 3.64992 5.16491 3.32506C5.80506 3.0002 6.55199 3.0003 8.04585 3.0005L15.9551 3.00155C17.4485 3.00175 18.1952 3.00185 18.8351 3.3267C19.475 3.65155 19.9158 4.25426 20.7974 5.45969L21.1855 5.99041C21.8744 6.97601 22.4054 8.27778 21.58 9.16285C21.0999 9.67766 20.4002 10.0019 19.621 10.0019C18.1734 10.0019 17 8.88267 17 7.50196Z" stroke="${color}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M14.9971 17C14.3133 17.6072 13.2247 18 11.9985 18C10.7723 18 9.68376 17.6072 9 17" stroke="${color}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
  return <SvgXml xml={svgXml} />;
};

// Community Icon (People)
export const CommunitySvg: React.FC<AssetIconProps> = ({ size = 24, color = "#364552" }) => {
  const svgXml = `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 8C15 9.65685 13.6569 11 12 11C10.3431 11 9 9.65685 9 8C9 6.34315 10.3431 5 12 5C13.6569 5 15 6.34315 15 8Z" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M16 4C17.6568 4 19 5.34315 19 7C19 8.22309 18.268 9.27523 17.2183 9.7423" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M13.7143 14H10.2857C7.91878 14 6 15.9188 6 18.2857C6 19.2325 6.76751 20 7.71428 20H16.2857C17.2325 20 18 19.2325 18 18.2857C18 15.9188 16.0812 14 13.7143 14Z" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M17.7139 13C20.0808 13 21.9996 14.9188 21.9996 17.2857C21.9996 18.2325 21.2321 19 20.2853 19" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M8 4C6.34315 4 5 5.34315 5 7C5 8.22309 5.73193 9.27523 6.78168 9.7423" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M3.71429 19C2.76751 19 2 18.2325 2 17.2857C2 14.9188 3.91878 13 6.28571 13" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
  return <SvgXml xml={svgXml} />;
};

// Party Icon (celebration/fireworks)
export const PartySvg: React.FC<AssetIconProps> = ({ size = 24, color = "#364552" }) => {
  const svgXml = `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5.65784 11.0022L4.18747 14.3105C2.3324 18.4844 1.40486 20.5713 2.41719 21.5837C3.42951 22.596 5.51646 21.6685 9.69037 19.8134L12.9987 18.343C15.5161 17.2242 16.7748 16.6647 16.9751 15.586C17.1754 14.5073 16.2014 13.5333 14.2535 11.5854L12.4155 9.7474C10.4675 7.79944 9.49353 6.82546 8.41482 7.02575C7.33611 7.22604 6.77669 8.48475 5.65784 11.0022Z" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M6.5 10.5L13.5 17.5M4.5 15.5L8.5 19.5" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M16 8L19 5" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M14.1973 2C14.5963 2.66667 14.9156 4.4 13 6" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M22 9.80274C21.3333 9.40365 19.6 9.08438 18 11" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M18.0009 2V2.02" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M22.0009 6V6.02" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M21.0009 13V13.02" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M11.0009 3V3.02" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
  return <SvgXml xml={svgXml} />;
};

// Book Icon
export const BookSvg: React.FC<AssetIconProps> = ({ size = 24, color = "#364552" }) => {
  const svgXml = `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.5055 2.01874C12.8289 2.83455 12 7.5 12 7.5V22C12 22 12.8867 17.1272 18.0004 16.5588C18.5493 16.4978 19 16.0576 19 15.5058V3.39309C19 2.5654 18.3216 1.87638 17.5055 2.01874Z" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M5.33333 5.00001C7.79379 4.99657 10.1685 5.88709 12 7.5V22C10.1685 20.3871 7.79379 19.4966 5.33333 19.5C3.77132 19.5 2.99032 19.5 2.64526 19.2792C2.4381 19.1466 2.35346 19.0619 2.22086 18.8547C2 18.5097 2 17.8941 2 16.6629V8.40322C2 6.97543 2 6.26154 2.54874 5.68286C3.09748 5.10418 3.65923 5.07432 4.78272 5.0146C4.965 5.00491 5.14858 5.00001 5.33333 5.00001Z" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M12 22.001C13.8315 20.3881 16.2062 19.4976 18.6667 19.501C20.2287 19.501 21.0097 19.501 21.3547 19.2802C21.5619 19.1476 21.6465 19.0629 21.7791 18.8558C22 18.5107 22 17.8951 22 16.6639V8.40424C22 6.97645 22 6.26256 21.4513 5.68388C20.9025 5.1052 20.1235 5.05972 19 5" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
  return <SvgXml xml={svgXml} />;
};

// Sword Icon
export const SwordSvg: React.FC<AssetIconProps> = ({ size = 24, color = "#364552" }) => {
  const svgXml = `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7.98651 9.49122L5.67712 7.51305C4.15399 6.20286 4.14889 4.30146 3.98633 3.01953C5.65267 3.09861 6.94342 3.24947 8.06745 4.19897L9.24332 5.53489L10.5158 6.96356M19.4573 18.4181L16.4925 15.4183M14.0215 18.4181C14.0441 18.1459 14.2223 17.4401 15.0408 16.6839C15.7751 16.0054 17.3676 14.3794 18.0832 13.6743C18.4886 13.2749 19.1532 12.9947 19.4573 12.9952M15.5683 12.8081L16.9049 14.2869M13.6763 14.4363L15.1705 15.7499M20.4616 17.9803C21.292 17.9819 22.0011 18.5952 21.9995 19.4251C21.9979 20.2549 21.292 20.9825 20.4616 20.981C19.6312 20.9794 18.9908 20.2492 18.9924 19.4194C19.046 18.5936 19.6568 18.0913 20.4616 17.9803Z" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M4.59593 18.393L7.5539 15.5007M4.56157 12.9871C4.83402 13.0092 5.59357 13.1911 6.274 14.0411C6.89872 14.8214 8.58371 16.3306 9.29062 17.0443C9.69102 17.4487 9.97105 18.0891 9.97105 18.393M7.2645 14.2299L15.5035 4.66412C16.8442 3.168 18.7179 3.13531 20.0036 2.99805C19.8918 4.66142 19.7155 5.9481 18.7435 7.05254L8.54959 15.9263M5.00618 19.4988C5.00618 20.3286 4.33301 21.0014 3.5026 21.0014C2.6722 21.0014 1.99902 20.3286 1.99902 19.4988C1.99902 18.6689 2.6722 17.9962 3.5026 17.9962C4.33301 17.9962 5.00618 18.6689 5.00618 19.4988Z" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
  return <SvgXml xml={svgXml} />;
};

// Boat Icon
export const BoatSvg: React.FC<AssetIconProps> = ({ size = 24, color = "#364552" }) => {
  const svgXml = `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 21.1932C2.68524 22.2443 3.57104 22.2443 4.27299 21.1932C6.52985 17.7408 8.67954 23.6764 10.273 21.2321C12.703 17.5694 14.4508 23.9218 16.273 21.1932C18.6492 17.5582 20.1295 23.5776 22 21.5842" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M3.57228 17L2.07481 12.6457C1.80373 11.8574 2.30283 11 3.03273 11H20.8582C23.9522 11 19.9943 17 17.9966 17" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M18 11L15.201 7.50122C14.4419 6.55236 13.2926 6 12.0775 6H8C6.89543 6 6 6.89543 6 8V11" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M10 6V3C10 2.44772 9.55228 2 9 2H8" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
  return <SvgXml xml={svgXml} />;
};

// Icon mapping for categories
export const categoryAssetIcons: { [key: string]: React.FC<AssetIconProps> } = {
  'Sports': SportSvg,
  'Sport': SportSvg,
  'Music': MusicSvg,
  'Musik': MusicSvg,
  'Arts & Culture': CultureSvg,
  'Kunst': CultureSvg,
  'Food': MarketsSvg,
  'Essen & Trinken': MarketsSvg,
  'Business': CommunitySvg,
  'Technology': CommunitySvg,
  'Health': CommunitySvg,
  'Education': CommunitySvg,
  'Family': CommunitySvg,
  'Entertainment': MusicSvg,
  'Community': CommunitySvg,
  'Gemeinde': CommunitySvg,
  'Workshop': CommunitySvg,
  'Markets': MarketsSvg,
  'Canvas': CultureSvg,
  // New category mappings
  'Fest': PartySvg,
  'Kultur': CommunitySvg,
  'Lesung': BookSvg,
  'Mittelalter': SwordSvg,
  'Natur': BoatSvg,
};