--[[
	KaritonWheels (Script) - ilagay SA LOOB ng imported na "Kariton" model (Model > Script).

	Ginagawa nito (kapag tumakbo ang laro / Play):
	  * Inaanchor ang Kariton_Body (attribute BodyAnchored = true; gawing false kung gusto mong physical na cart).
	  * Gumagawa ng HingeConstraint para sa Wheel_L, Wheel_R at (kung meron) Caster_L, Caster_R. Ang axis ay kinukuha sa
	    pagitan ng dalawang malaking gulong, kaya tama kahit gaano pa naikot ang model pagka-import.
	  * Libre ang pag-ikot ng gulong (puwedeng itulak / gumulong). Para paikutin nang kusa: i-set ang attribute
	    "WheelSpeed" ng Model (radians bawat segundo, hal. 4; negatibo = pabalik; 0 = libre). Ang casters ay sumasabay
	    sa tamang bilis (ayon sa laki nila).

	Ang mga pangalan ng mesh sa export: Kariton_Body, Wheel_L, Wheel_R, Caster_L, Caster_R (puwedeng may suffix ang importer).
]]
local model = script.Parent

local function find(key)
	for _, d in ipairs(model:GetDescendants()) do
		if d:IsA("BasePart") and string.find(d.Name, key, 1, true) then
			return d
		end
	end
	return nil
end

local body = find("Kariton_Body") or find("Body")
local wheelL, wheelR = find("Wheel_L"), find("Wheel_R")
local casterL, casterR = find("Caster_L"), find("Caster_R")
if not (body and wheelL and wheelR) then
	warn("[KaritonWheels] Hindi makita ang Kariton_Body / Wheel_L / Wheel_R sa " .. model:GetFullName())
	return
end

if model:GetAttribute("BodyAnchored") == nil then
	model:SetAttribute("BodyAnchored", true)
end
if model:GetAttribute("WheelSpeed") == nil then
	model:SetAttribute("WheelSpeed", 0)
end
body.Anchored = model:GetAttribute("BodyAnchored") == true

-- axle direction = linya sa pagitan ng dalawang malaking gulong (hindi umaasa sa orientation ng pagka-import)
local axis = wheelR.Position - wheelL.Position
if axis.Magnitude < 1e-3 then
	axis = body.CFrame.RightVector
end
axis = axis.Unit
local up = body.CFrame.UpVector
up = up - axis * up:Dot(axis)
if up.Magnitude < 1e-3 then
	up = Vector3.yAxis - axis * Vector3.yAxis:Dot(axis)
end
up = up.Unit

local function radiusOf(p)
	local s = p.Size
	local m = { s.X, s.Y, s.Z }
	table.sort(m)
	return m[3] / 2 -- pinakamalaking sukat = diameter ng gulong
end

local entries = {}

local function addHinge(wheel, label, ratio)
	if not wheel then
		return
	end
	wheel.Anchored = model:GetAttribute("BodyAnchored") == true and false or false
	local cf = CFrame.fromMatrix(wheel.Position, axis, up) -- X axis ng attachment = axis ng hinge
	local a0 = Instance.new("Attachment")
	a0.Name = label .. "_BodyAttachment"
	a0.Parent = body
	a0.WorldCFrame = cf
	local a1 = Instance.new("Attachment")
	a1.Name = label .. "_WheelAttachment"
	a1.Parent = wheel
	a1.WorldCFrame = cf
	local hinge = Instance.new("HingeConstraint")
	hinge.Name = label .. "_Hinge"
	hinge.Attachment0 = a0
	hinge.Attachment1 = a1
	hinge.ActuatorType = Enum.ActuatorType.None -- libre ang pag-ikot
	hinge.Parent = body
	table.insert(entries, { hinge = hinge, ratio = ratio })
end

local rMain = radiusOf(wheelL)
addHinge(wheelL, "Wheel_L", 1)
addHinge(wheelR, "Wheel_R", 1)
if casterL then
	addHinge(casterL, "Caster_L", rMain / radiusOf(casterL))
end
if casterR then
	addHinge(casterR, "Caster_R", rMain / radiusOf(casterR))
end

local function applySpeed()
	local w = model:GetAttribute("WheelSpeed")
	if type(w) ~= "number" then
		w = 0
	end
	for _, e in ipairs(entries) do
		if w == 0 then
			e.hinge.ActuatorType = Enum.ActuatorType.None
		else
			e.hinge.ActuatorType = Enum.ActuatorType.Motor
			e.hinge.MotorMaxTorque = 1e9
			e.hinge.MotorMaxAcceleration = 1e9
			e.hinge.AngularVelocity = w * e.ratio
		end
	end
end
model:GetAttributeChangedSignal("WheelSpeed"):Connect(applySpeed)
applySpeed()
