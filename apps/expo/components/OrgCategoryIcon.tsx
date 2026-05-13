import React from 'react';
import { SvgXml } from 'react-native-svg';

type Props = {
  name: string;
  size?: number;
  color?: string;
};

const ICONS: Record<string, string> = {
  'agreement-02': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M22 6.75H19.2111C18.61 6.75 18.3094 6.75 18.026 6.66418C17.7426 6.57837 17.4925 6.41165 16.9923 6.0782C16.2421 5.57803 15.3862 5.00745 14.961 4.87872C14.5359 4.75 14.085 4.75 13.1833 4.75C11.9571 4.75 11.1667 4.75 10.6154 4.97836C10.0641 5.20672 9.63056 5.64027 8.76347 6.50736L8.00039 7.27044C7.80498 7.46585 7.70727 7.56356 7.64695 7.66002C7.42335 8.01761 7.44813 8.47705 7.70889 8.80851C7.77924 8.89793 7.88689 8.98456 8.10218 9.15782C8.89796 9.79824 10.0452 9.73432 10.7658 9.00942L12 7.76786H13L19 13.8036C19.5523 14.3592 19.5523 15.2599 19 15.8155C18.4477 16.3711 17.5523 16.3711 17 15.8155L16.5 15.3125M13.5 16.3185L14.5 17.3244C15.0523 17.88 15.9477 17.88 16.5 17.3244C17.0523 16.7689 17.0523 15.8681 16.5 15.3125L13.5 12.2947M11.5 14.3185L13.5 16.3185C14.0523 16.874 14.0523 17.7748 13.5 18.3304C12.9477 18.8859 12.0523 18.8859 11.5 18.3304L10 16.8214M2 14.75H2.31894C3.14808 14.75 3.56266 14.75 3.93435 14.9062C4.30604 15.0625 4.59615 15.3586 5.17637 15.9509L8 18.8334C8.55229 19.3889 9.44772 19.3889 10 18.8334C10.5523 18.2778 10.5523 17.377 10 16.8214L9.5 16.3185" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M22 14.75H19.5" stroke="black" stroke-width="1.5" stroke-linecap="round"/>
<path d="M8.5 6.75H2" stroke="black" stroke-width="1.5" stroke-linecap="round"/>
</svg>`,
  'balance-scale': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M12 7C13.1046 7 14 6.10457 14 5C14 3.89543 13.1046 3 12 3C10.8954 3 10 3.89543 10 5C10 6.10457 10.8954 7 12 7Z" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M10 5H4M14 5H20" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M17 21H7" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M12 7V21" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M16 14L18.5 8H19.5L22 14C22 15.6569 20.6569 17 19 17C17.3431 17 16 15.6569 16 14ZM22 14H16" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M2 14L4.5 8H5.5L8 14C8 15.6569 6.65685 17 5 17C3.34315 17 2 15.6569 2 14ZM8 14H2" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
  'flag-02': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M4 7V21" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M11.7576 3.90865C8.45236 2.22497 5.85125 3.21144 4.55426 4.2192C4.32048 4.40085 4.20358 4.49167 4.10179 4.69967C4 4.90767 4 5.10138 4 5.4888V14.7319C4.9697 13.6342 7.87879 11.9328 11.7576 13.9086C15.224 15.6744 18.1741 14.9424 19.5697 14.1795C19.7633 14.0737 19.8601 14.0207 19.9301 13.9028C20 13.7849 20 13.6569 20 13.4009V5.87389C20 5.04538 20 4.63113 19.8027 4.48106C19.6053 4.33099 19.1436 4.459 18.2202 4.71504C16.64 5.15319 14.3423 5.22532 11.7576 3.90865Z" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
  'license-draft': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M19.75 11V10C19.75 6.22876 19.75 4.34315 18.5784 3.17157C17.4068 2 15.5212 2 11.75 2H10.7501C6.97883 2 5.09323 2 3.92166 3.17156C2.75009 4.34312 2.75007 6.22872 2.75004 9.99993L2.75 14C2.74997 17.7712 2.74996 19.6568 3.92149 20.8284C5.09306 21.9999 6.97874 22 10.75 22" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M7.25 7H15.25M7.25 12H15.25" stroke="black" stroke-width="1.5" stroke-linecap="round"/>
<path d="M13.25 20.8268V22H14.4234C14.8328 22 15.0375 22 15.2215 21.9238C15.4056 21.8475 15.5503 21.7028 15.8398 21.4134L20.6634 16.5894C20.9364 16.3164 21.0729 16.1799 21.1459 16.0327C21.2848 15.7525 21.2848 15.4236 21.1459 15.1434C21.0729 14.9961 20.9364 14.8596 20.6634 14.5866C20.3903 14.3136 20.2538 14.1771 20.1065 14.1041C19.8263 13.9653 19.4973 13.9653 19.2171 14.1041C19.0699 14.1771 18.9333 14.3136 18.6603 14.5866L13.8367 19.4106C13.5473 19.7 13.4025 19.8447 13.3263 20.0287C13.25 20.2128 13.25 20.4174 13.25 20.8268Z" stroke="black" stroke-width="1.5" stroke-linejoin="round"/>
</svg>`,
  'restaurant-01': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M15 10L4 21.001" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M17.9997 3.00098L14.9997 6.00098C14.4545 6.54623 14.1819 6.81885 14.0361 7.11295C13.7588 7.6725 13.7588 8.32945 14.0361 8.88901C14.1819 9.1831 14.4545 9.45573 14.9997 10.001C15.545 10.5462 15.8176 10.8189 16.1117 10.9646C16.6713 11.2419 17.3282 11.2419 17.8878 10.9646C18.1819 10.8189 18.4545 10.5462 18.9997 10.001L21.9997 7.00098" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M20 4.99902L17 7.99902" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M8.84473 9.84571C7.47968 11.2108 5.60771 11.552 3.90145 9.84571C2.19514 8.13939 1.30058 5.03166 2.66563 3.66661C4.03069 2.30156 7.13841 3.19611 8.84473 4.90243C10.551 6.60868 10.2098 8.48065 8.84473 9.84571ZM8.84473 9.84571L20 21.001" stroke="black" stroke-width="2" stroke-linecap="round"/>
</svg>`,
  'store-01': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M3.5 10V15C3.5 17.8284 3.5 19.2426 4.37867 20.1213C5.25735 21 6.67157 21 9.5 21H14.5C17.3284 21 18.7427 21 19.6213 20.1213C20.5 19.2426 20.5 17.8284 20.5 15V10" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M17 7.50184C17 8.88255 15.8807 9.99997 14.5 9.99997C13.1193 9.99997 12 8.88068 12 7.49997C12 8.88068 10.8807 9.99997 9.5 9.99997C8.11928 9.99997 7 8.88068 7 7.49997C7 8.88068 5.82653 9.99997 4.37899 9.99997C3.59982 9.99997 2.90006 9.67567 2.41998 9.16087C1.5946 8.2758 2.12559 6.97403 2.81446 5.98842L3.202 5.45851C4.08384 4.2527 4.52476 3.6498 5.16491 3.32494C5.80506 3.00008 6.55199 3.00018 8.04585 3.00038L15.9551 3.00143C17.4485 3.00163 18.1952 3.00173 18.8351 3.32658C19.475 3.65143 19.9158 4.25414 20.7974 5.45957L21.1855 5.99029C21.8744 6.97589 22.4054 8.27766 21.58 9.16273C21.0999 9.67754 20.4002 10.0018 19.621 10.0018C18.1734 10.0018 17 8.88255 17 7.50184Z" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M14.9971 17C14.3133 17.6072 13.2247 18 11.9985 18C10.7723 18 9.68376 17.6072 9 17" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
};

export default function OrgCategoryIcon({ name, size = 28, color = '#000000' }: Props) {
  const xml = ICONS[name];
  if (!xml) return null;
  const tinted = xml.replace(/stroke="black"/g, `stroke="${color}"`);
  return <SvgXml xml={tinted} width={size} height={size} />;
}
