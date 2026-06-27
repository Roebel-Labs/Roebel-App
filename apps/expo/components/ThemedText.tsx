import { Text, type TextProps, StyleSheet } from "react-native";

import { useThemeColor } from "@/hooks/useThemeColor";
import { fontFamily } from "@/constants/theme";

export type ThemedTextProps = TextProps & {
	lightColor?: string;
	darkColor?: string;
	type?:
		| "default"
		| "title"
		| "defaultSemiBold"
		| "subtitle"
		| "link"
		| "subtext";
};

export function ThemedText({
	style,
	lightColor,
	darkColor,
	type = "default",
	...rest
}: ThemedTextProps) {
	const color = useThemeColor({ light: lightColor, dark: darkColor }, "text");
	const subTextColor = useThemeColor(
		{ light: lightColor, dark: darkColor },
		"subtext",
	);

	return (
		<Text
			style={[
				{ color: type === "subtext" ? subTextColor : color },
				type === "default" ? styles.default : undefined,
				type === "title" ? styles.title : undefined,
				type === "defaultSemiBold" ? styles.defaultSemiBold : undefined,
				type === "subtitle" ? styles.subtitle : undefined,
				type === "link" ? styles.link : undefined,
				type === "subtext" ? styles.subtext : undefined,
				style,
			]}
			{...rest}
		/>
	);
}

const styles = StyleSheet.create({
	default: {
		fontFamily: fontFamily.regular,
		fontSize: 16,
		lineHeight: 24,
	},
	subtext: {
		fontFamily: fontFamily.regular,
		fontSize: 14,
		lineHeight: 20,
	},
	defaultSemiBold: {
		fontFamily: fontFamily.semiBold,
		fontSize: 16,
		lineHeight: 24,
	},
	title: {
		// Headline — Mona Sans SemiCondensed Bold
		fontFamily: fontFamily.heading,
		fontSize: 32,
		lineHeight: 32,
	},
	subtitle: {
		fontFamily: fontFamily.heading,
		fontSize: 20,
	},
	link: {
		fontFamily: fontFamily.regular,
		lineHeight: 30,
		fontSize: 16,
		color: "#0a7ea4",
	},
});
